import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadAudit } from "@/lib/geo/store";
import { loadPlan, planAtLeast, planBlockResponse } from "@/lib/geo/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    return await inWorkspace(access, async () => {
      const plan = await loadPlan(access.identity.email);
      if (!planAtLeast(plan, "growth")) {
        return planBlockResponse("The activity log is part of Growth and above - upgrade to use it.", plan);
      }
      const entries = await loadAudit(50);
      return Response.json({ entries });
    });
  } catch (error) {
    return errorResponse(error, "GEO audit");
  }
}
