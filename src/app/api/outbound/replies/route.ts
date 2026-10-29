import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { recordHumanReply } from "@/lib/outbound/campaign";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Records a human reply on an enrollment: marks it replied and cancels all
// cancellable intents BEFORE any classification (PRD F15). Provider-accepted
// messages cannot be recalled; only pre-dispatch intents are cancelled.

export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
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
    await recordAudit(access.workspaceUid, access.identity.uid, "reply.recorded", `enrollment:${enrollmentId}`, "success", `cancelledIntents=${result.cancelledIntents}`);
    return Response.json({ enrollmentId, status: "replied", cancelledIntents: result.cancelledIntents }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound replies");
  }
}
