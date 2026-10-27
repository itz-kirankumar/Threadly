import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { beginConsent, revokeConsent } from "@/lib/outbound/consent-flow";
import { RtdbConsentStore } from "@/lib/outbound/rtdb-consent-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import type { Sender } from "@/lib/outbound/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  // Refuse to enable against the implicit default root: enabling requires an
  // explicit data-root decision so a stray flag can never silently target
  // production tenant data.
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Registers a sender mailbox in pending_consent status. Activation happens
// only through the OAuth consent flow (begin-consent -> provider consent ->
// callback verifies mailbox identity), which is implemented but inactive
// without provider client envs; checkDispatch denies non-active senders.
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage senders." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "register";
    if (action === "begin-consent") {
      const senderId = typeof body.senderId === "string" ? body.senderId : "";
      if (!senderId) return Response.json({ error: "senderId is required." }, { status: 400 });
      const result = await beginConsent(new RtdbSenderStore(), { tenantId: access.workspaceUid, senderId });
      if (!result.ok) {
        return Response.json(
          { error: result.error, senderStatus: "pending_consent", ...(result.requiredEnvs ? { requiredEnvs: result.requiredEnvs } : {}) },
          { status: result.status, headers: NO_STORE }
        );
      }
      return Response.json(
        { consentUrl: result.consentUrl, expiresAt: result.expiresAt, provider: result.provider },
        { status: 200, headers: NO_STORE }
      );
    }
    if (action === "revoke-consent") {
      const senderId = typeof body.senderId === "string" ? body.senderId : "";
      if (!senderId) return Response.json({ error: "senderId is required." }, { status: 400 });
      const result = await revokeConsent(new RtdbSenderStore(), new RtdbConsentStore(), { tenantId: access.workspaceUid, senderId });
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
      }
      return Response.json({ senderId, status: "revoked" }, { status: 200, headers: NO_STORE });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const provider = body.provider === "gmail" || body.provider === "microsoft" ? body.provider : null;
    if (!email.includes("@") || !provider) {
      return Response.json({ error: "A valid email and provider (gmail|microsoft) are required." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const sender: Sender = {
      tenantId: access.workspaceUid,
      senderId: `snd_${crypto.randomUUID()}`,
      provider,
      email,
      status: "pending_consent",
      consentTraceId: null,
      scopes: [],
      dailyCap: 25,
      localTimezone: typeof body.localTimezone === "string" ? body.localTimezone : "UTC",
      createdAt: now,
      createdBy: access.identity.uid,
    };
    const store = new RtdbSenderStore();
    await store.saveSender(sender);
    return Response.json({ sender }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound senders");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const store = new RtdbSenderStore();
    const senders = await store.listSenders(access.workspaceUid);
    return Response.json({ senders }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound senders");
  }
}
