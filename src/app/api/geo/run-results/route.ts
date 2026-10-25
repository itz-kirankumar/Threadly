import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadRunDetail } from "@/lib/geo/store";

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
      const detail = await loadRunDetail(runId);
      if (!detail) {
        return Response.json({ error: "No stored results for that run." }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
      return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) {
    return errorResponse(error, "GEO run detail");
  }
}
