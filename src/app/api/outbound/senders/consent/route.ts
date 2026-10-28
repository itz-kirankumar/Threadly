import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { beginConsent } from "@/lib/outbound/consent-flow";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Begins the OAuth consent flow for a registered sender. Returns the
// provider consent URL when the deployment has provider OAuth client envs;
// otherwise 503 with the required env names. The flow is implemented but
// inactive without deployment config, and completing a real consent is an
// owner-authorized action.
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage sender consent." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const senderId = typeof body.senderId === "string" ? body.senderId : "";
    if (!senderId) return Response.json({ error: "senderId is required." }, { status: 400 });
    const result = await beginConsent(new RtdbSenderStore(), { tenantId: access.workspaceUid, senderId });
    if (!result.ok) {
      return Response.json(
        { error: result.error, ...(result.requiredEnvs ? { requiredEnvs: result.requiredEnvs } : {}) },
        { status: result.status, headers: NO_STORE }
      );
    }
    return Response.json(
      {
        consentUrl: result.consentUrl,
        expiresAt: result.expiresAt,
        provider: result.provider,
        notice: "Completing this consent grants Threadly permission to send from the mailbox. The sender activates only after the provider verifies the mailbox identity matches the registered sender.",
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound sender consent");
  }
}
