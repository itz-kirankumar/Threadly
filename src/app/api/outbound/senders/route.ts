import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import type { Sender } from "@/lib/outbound/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  return process.env.OUTBOUND_ENABLED === "true";
}

// Registers a sender mailbox in pending_consent status. There is no path to
// "active" from any route: activation needs a real OAuth consent flow, which
// is not built. Until then dispatch cannot pass its sender gate.
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
