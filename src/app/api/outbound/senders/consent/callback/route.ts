import { errorResponse } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { completeConsent } from "@/lib/outbound/consent-flow";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";
import { RtdbConsentStore } from "@/lib/outbound/rtdb-consent-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// OAuth consent callback. Verifies the signed state, exchanges the code,
// verifies the consented mailbox matches the registered sender, stores
// encrypted tokens, writes the consent trace and activates the sender. This
// is the only sender-activation path.
export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) {
      return Response.json({ error: `Consent was not completed at the provider: ${providerError}` }, { status: 400, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can complete sender consent." }, { status: 403, headers: NO_STORE });
    }
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!state || !code) {
      return Response.json({ error: "state and code are required." }, { status: 400, headers: NO_STORE });
    }
    const result = await completeConsent(new RtdbSenderStore(), new RtdbConsentStore(), {
      expectedTenantId: access.workspaceUid,
      state,
      code,
      audit: new RtdbAuditStore(),
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
    }
    return Response.json(
      { senderId: result.senderId, status: "active", consentTraceId: result.consentTraceId, consentorIdentity: result.consentorIdentity },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound sender consent callback");
  }
}
