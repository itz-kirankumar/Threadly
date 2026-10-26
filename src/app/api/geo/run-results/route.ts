import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadRunDetail, loadWorkspace } from "@/lib/geo/store";
import { loadPlan, PLAN_LIMITS, planBlockResponse } from "@/lib/geo/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full detail for one past scan run: the questions scanned and every provider
// answer, citation set and web result captured in that run.
export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const runId = new URL(request.url).searchParams.get("runId") ?? "";
    if (!/^run-[0-9a-f-]+$/i.test(runId)) {
      return Response.json({ error: "Unknown scan run." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return await inWorkspace(access, async () => {
      const [detail, plan, workspace] = await Promise.all([loadRunDetail(runId), loadPlan(access.identity.email), loadWorkspace()]);
      if (!detail) {
        return Response.json({ error: "No stored results for that run." }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
      const historyDays = PLAN_LIMITS[plan].historyDays;
      const startedAt = Date.parse(workspace.runs.find((run) => run.id === runId)?.startedAt ?? "");
      if (historyDays != null && Number.isFinite(startedAt) && startedAt < Date.now() - historyDays * 24 * 60 * 60 * 1000) {
        return planBlockResponse(`Scan history on your plan covers the last ${historyDays} days - upgrade to keep full history.`, plan);
      }
      return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    return errorResponse(error, "GEO run detail");
  }
}
