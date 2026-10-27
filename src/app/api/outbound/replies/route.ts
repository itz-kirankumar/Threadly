import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { recordHumanReply } from "@/lib/outbound/campaign";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";

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

// Records a human reply on an enrollment: marks it replied and cancels all
// cancellable intents BEFORE any classification (PRD F15). Provider-accepted
// messages cannot be recalled; only pre-dispatch intents are cancelled.
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    const enrollmentId = typeof body.enrollmentId === "string" ? body.enrollmentId : "";
    if (!campaignId || !enrollmentId) {
      return Response.json({ error: "campaignId and enrollmentId are required." }, { status: 400 });
    }
    const store = new RtdbCampaignStore();
    const enrollments = await store.listEnrollments(access.workspaceUid, campaignId);
    const enrollment = enrollments.find((e) => e.enrollmentId === enrollmentId);
    if (!enrollment) return Response.json({ error: "Enrollment not found." }, { status: 404 });
    const intents = await store.listIntentsByCampaign(access.workspaceUid, campaignId);
    const result = await recordHumanReply(store, {
      tenantId: access.workspaceUid,
      enrollment,
      intents,
      actor: access.identity.uid,
      now: new Date(),
    });
    return Response.json({ enrollmentId, status: "replied", cancelledIntents: result.cancelledIntents }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound replies");
  }
}
