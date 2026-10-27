import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { planCampaignIntents } from "@/lib/outbound/planner";
import { advanceEnrollments } from "@/lib/outbound/sequence";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbExperimentStore } from "@/lib/outbound/rtdb-experiment-store";
import { RtdbLedgerStore } from "@/lib/outbound/rtdb-store";

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

// Runs the planner for one campaign. Creates drafted intents only; nothing
// is sent by this or any other route.
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can run planning." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    if (!campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });
    const advancement = await advanceEnrollments(
      { campaigns: new RtdbCampaignStore() },
      { tenantId: access.workspaceUid, campaignId }
    );
    const result = await planCampaignIntents(
      { campaigns: new RtdbCampaignStore(), ledger: new RtdbLedgerStore(), contacts: new RtdbContactStore(), experiments: new RtdbExperimentStore() },
      { tenantId: access.workspaceUid, campaignId, actor: access.identity.uid, now: new Date() }
    );
    return Response.json(
      {
        campaignId: result.campaignId,
        plannedCount: result.planned.length,
        planned: result.planned.map((i) => ({ intentId: i.intentId, enrollmentId: i.enrollmentId, contactId: i.contactId, step: i.step, status: i.status })),
        skipped: result.skipped,
        blocked: result.blocked,
        advancement,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound plan");
  }
}
