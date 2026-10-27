import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { intentUniqueKey } from "@/lib/outbound/ledger";
import { RtdbLedgerStore } from "@/lib/outbound/rtdb-store";
import type { MessageIntent } from "@/lib/outbound/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The enterprise outbound surface ships dark: OUTBOUND_ENABLED must be set to
// "true" explicitly, and no sender/provider call exists in this route.
function outboundEnabled(): boolean {
  return process.env.OUTBOUND_ENABLED === "true";
}

// POST /api/outbound/intents - create (idempotently) one send intent.
export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can create send intents." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 8 * 1024)) as {
      enrollmentId?: unknown; campaignId?: unknown; campaignVersion?: unknown;
      contactId?: unknown; senderId?: unknown; step?: unknown;
    };
    if (
      typeof body.enrollmentId !== "string" || typeof body.campaignId !== "string" ||
      typeof body.contactId !== "string" || typeof body.senderId !== "string" ||
      typeof body.campaignVersion !== "number" || typeof body.step !== "number"
    ) {
      return Response.json({ error: "enrollmentId, campaignId, contactId, senderId, campaignVersion and step are required." }, { status: 400 });
    }
    const tenantId = access.workspaceUid;
    const now = new Date().toISOString();
    const intent: MessageIntent = {
      tenantId,
      intentId: `mi_${crypto.randomUUID()}`,
      uniqueKey: intentUniqueKey({ tenantId, enrollmentId: body.enrollmentId, campaignVersion: body.campaignVersion, step: body.step }),
      enrollmentId: body.enrollmentId,
      campaignId: body.campaignId,
      campaignVersion: body.campaignVersion,
      contactId: body.contactId,
      senderId: body.senderId,
      step: body.step,
      status: "drafted",
      statusUpdatedAt: now,
      cancelReason: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      reconciledAt: null,
      createdAt: now,
      createdBy: access.identity.uid,
    };
    const store = new RtdbLedgerStore();
    const result = await store.createIntentIfAbsent(intent);
    if (result === "duplicate") {
      const existing = await store.findIntentByUniqueKey(intent.uniqueKey);
      return Response.json({ intent: existing, duplicate: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ intent, duplicate: false }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "outbound intents");
  }
}

// GET /api/outbound/intents?id=... - read one intent inside the caller's tenant.
export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const campaignId = url.searchParams.get("campaignId") ?? "";
    if (!id && campaignId) {
      const { RtdbCampaignStore } = await import("@/lib/outbound/rtdb-campaign-store");
      const cs = new RtdbCampaignStore();
      const intents = await cs.listIntentsByCampaign(access.workspaceUid, campaignId);
      return Response.json({ intents }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!id) return Response.json({ error: "id is required." }, { status: 400 });
    const store = new RtdbLedgerStore();
    const intent = await store.getIntent(access.workspaceUid, id);
    if (!intent) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ intent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "outbound intents");
  }
}
