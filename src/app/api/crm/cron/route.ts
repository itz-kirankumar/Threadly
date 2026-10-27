import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { runBatchAutoFollowUps } from "@/lib/crm/outreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const result = await inWorkspace(access, async () => {
      return runBatchAutoFollowUps();
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "CRM cron follow-up runner");
  }
}

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const result = await inWorkspace(access, async () => {
      return runBatchAutoFollowUps();
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error, "CRM cron follow-up runner");
  }
}
