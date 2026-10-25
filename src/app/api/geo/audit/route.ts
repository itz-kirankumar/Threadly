import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadAudit } from "@/lib/geo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    return await inWorkspace(access, async () => {
      const entries = await loadAudit(50);
      return Response.json({ entries });
    });
  } catch (error) {
    return errorResponse(error, "GEO audit");
  }
}
