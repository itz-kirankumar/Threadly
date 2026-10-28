import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { assignConversationOwner, classifyReplyText, INTENTS, reclassifyConversation, routeUncertain } from "@/lib/outbound/conversations";
import { RtdbConversationStore } from "@/lib/outbound/rtdb-conversation-store";
import type { Conversation, ConversationIntent } from "@/lib/outbound/types";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Records a conversation/reply. humanReplySeenAt is written at intake time,
// before any classification. Classification is assistive only ("auto" with
// "uncertain" as the default); automated actions never key off it.

async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
    // F16 follow-up actions on an existing conversation.
    if (body.action === "reclassify" || body.action === "assign-owner") {
      if (access.role !== "owner" && access.role !== "admin") {
        return Response.json({ error: "Only workspace admins can manage conversations." }, { status: 403, headers: NO_STORE });
      }
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
      if (!conversationId) return Response.json({ error: "conversationId is required." }, { status: 400 });
      const store = new RtdbConversationStore();
      if (body.action === "reclassify") {
        const intent = INTENTS.find((i) => i === body.classification) as ConversationIntent | undefined;
        if (!intent) return Response.json({ error: "a valid classification is required." }, { status: 400 });
        const updated = await reclassifyConversation(store, { tenantId: access.workspaceUid, conversationId, intent, actor: access.identity.uid });
        await audit(access.workspaceUid, access.identity.uid, "conversation.reclassified", `conversation:${conversationId}`, "success", `intent=${intent} by=human`);
        return Response.json({ conversation: updated }, { headers: NO_STORE });
      }
      const ownerUserId = typeof body.ownerUserId === "string" ? body.ownerUserId.trim() : "";
      if (!ownerUserId) return Response.json({ error: "ownerUserId is required." }, { status: 400 });
      const updated = await assignConversationOwner(store, { tenantId: access.workspaceUid, conversationId, ownerUserId, actor: access.identity.uid });
      await audit(access.workspaceUid, access.identity.uid, "conversation.owner_assigned", `conversation:${conversationId}`, "success", `owner=${ownerUserId}`);
      return Response.json({ conversation: updated }, { headers: NO_STORE });
    }

    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const replyText = typeof body.replyText === "string" ? body.replyText : "";
    if (!contactId || !replyText) {
      return Response.json({ error: "contactId and replyText are required." }, { status: 400 });
    }
    const requested = INTENTS.find((i) => i === body.classification) as ConversationIntent | undefined;
    const now = new Date().toISOString();
    const conversation: Conversation = {
      tenantId: access.workspaceUid,
      conversationId: `cv_${crypto.randomUUID()}`,
      contactId,
      enrollmentId: typeof body.enrollmentId === "string" ? body.enrollmentId : null,
      humanReplySeenAt: now,
      classification: requested ?? classifyReplyText(replyText),
      classifiedBy: requested ? "human" : "auto",
      ownerUserId: null,
      createdAt: now,
      createdBy: access.identity.uid,
    };
    const store = new RtdbConversationStore();
    await store.saveConversation(conversation);
    await audit(access.workspaceUid, access.identity.uid, "conversation.created", `conversation:${conversation.conversationId}`, "success", `contact=${conversation.contactId}`);
    // F16: an uncertain auto-classification reaches a person - assign the
    // requesting member as owner when nobody owns it yet.
    const routed = await routeUncertain(store, { tenantId: access.workspaceUid, conversationId: conversation.conversationId, fallbackOwnerUserId: access.identity.uid });
    if (routed.assigned) {
      await audit(access.workspaceUid, access.identity.uid, "conversation.uncertain_routed", `conversation:${conversation.conversationId}`, "success", `owner=${access.identity.uid}`);
    }
    return Response.json({ conversation: routed.conversation }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound conversations");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const store = new RtdbConversationStore();
    const conversations = await store.listConversations(access.workspaceUid);
    const meetings = await store.listMeetings(access.workspaceUid);
    return Response.json({ conversations, meetings }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound conversations");
  }
}
