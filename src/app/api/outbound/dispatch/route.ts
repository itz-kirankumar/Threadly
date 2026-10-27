import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { runDispatch } from "@/lib/outbound/dispatch";
import { RoutingDispatchProvider } from "@/lib/outbound/providers/live";
import { RtdbConsentStore } from "@/lib/outbound/rtdb-consent-store";
import { RtdbDraftStore } from "@/lib/outbound/drafts-rtdb";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import { RtdbLedgerStore } from "@/lib/outbound/rtdb-store";
import { RtdbUsageStore } from "@/lib/outbound/rtdb-usage-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Runs the dispatch runner through the routing provider: the live adapter is
// reachable only for an active sender (real OAuth consent completed) with
// OUTBOUND_PROVIDERS_LIVE=true on the deployment; no current deployment sets
// it, so every send falls back to the mock and stays synthetic. Every gate in
// checkDispatch still applies, including sender_not_active.
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can run dispatch." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    if (!campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });
    const result = await runDispatch(
      {
        campaigns: new RtdbCampaignStore(),
        ledger: new RtdbLedgerStore(),
        drafts: new RtdbDraftStore(),
        senders: new RtdbSenderStore(),
        contacts: new RtdbContactStore(),
        usage: new RtdbUsageStore(),
      },
      new RoutingDispatchProvider(new RtdbConsentStore()),
      { tenantId: access.workspaceUid, campaignId, actor: access.identity.uid, now: new Date() }
    );
    return Response.json(
      { campaignId, provider: "routing(mock-unless-live)", dispatchedCount: result.dispatched.length, dispatched: result.dispatched, deferred: result.deferred, skipped: result.skipped },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound dispatch");
  }
}
