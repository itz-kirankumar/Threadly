import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { discoverLeadsFromGeo } from "@/lib/crm/discover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const result = await inWorkspace(access, async () => {
      return discoverLeadsFromGeo();
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "POST /api/crm/discover");
  }
}
