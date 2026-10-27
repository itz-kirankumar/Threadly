import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { generateDrafts } from "@/lib/outbound/draft-run";
import { RtdbDraftStore } from "@/lib/outbound/drafts-rtdb";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbLedgerStore } from "@/lib/outbound/rtdb-store";
import { RtdbUsageStore } from "@/lib/outbound/rtdb-usage-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Runs the template draft worker for one campaign. Renders stored drafts for
// drafted intents; nothing is sent by this or any other route.
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can run draft generation." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    if (!campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });
    const result = await generateDrafts(
      {
        campaigns: new RtdbCampaignStore(),
        ledger: new RtdbLedgerStore(),
        contacts: new RtdbContactStore(),
        drafts: new RtdbDraftStore(),
        usage: new RtdbUsageStore(),
      },
      { tenantId: access.workspaceUid, campaignId, actor: access.identity.uid, now: new Date() }
    );
    return Response.json(
      { campaignId, renderedCount: result.rendered.length, rendered: result.rendered, skipped: result.skipped, usageRecorded: result.usageRecorded },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound drafts run");
  }
}

// Lists stored drafts, optionally filtered by campaign.
export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const store = new RtdbDraftStore();
    let drafts = await store.listDrafts(access.workspaceUid);
    if (campaignId) {
      const campaigns = new RtdbCampaignStore();
      const intents = await campaigns.listIntentsByCampaign(access.workspaceUid, campaignId);
      const ids = new Set(intents.map((i) => i.intentId));
      drafts = drafts.filter((d) => ids.has(d.intentId));
    }
    return Response.json(
      { drafts: drafts.map((d) => ({ draftId: d.draftId, intentId: d.intentId, step: d.step, subject: d.subject, body: d.body, engine: d.engine, renderedAt: d.renderedAt })) },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound drafts list");
  }
}
