import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { classifyReplyText, INTENTS } from "@/lib/outbound/conversations";
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
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
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
    return Response.json({ conversation }, { status: 201, headers: NO_STORE });
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
    const store = new RtdbConversationStore();
    const conversations = await store.listConversations(access.workspaceUid);
    const meetings = await store.listMeetings(access.workspaceUid);
    return Response.json({ conversations, meetings }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound conversations");
  }
}
