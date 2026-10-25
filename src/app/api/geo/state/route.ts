import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadKeySettings, loadWorkspace } from "@/lib/geo/store";
import { providerKeyStatuses } from "@/lib/geo/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    return await inWorkspace(access, async () => {
      const [state, keySettings] = await Promise.all([loadWorkspace(), loadKeySettings()]);
      state.providers = providerKeyStatuses(keySettings);
      return Response.json({
        ...state,
        team: {
          role: access.role,
          shared: access.shared,
          teamsEnabled: access.teamsEnabled,
          workspaceOwner: access.shared ? undefined : access.identity.name,
        },
      });
    });
  } catch (error) {
    return errorResponse(error, "GEO state");
  }
}
