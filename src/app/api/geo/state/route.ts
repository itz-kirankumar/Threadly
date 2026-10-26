import { loadPlan } from "@/lib/geo/plan";
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
      const [state, keySettings, plan] = await Promise.all([loadWorkspace(), loadKeySettings(), loadPlan(access.identity.email)]);
      state.providers = providerKeyStatuses(keySettings);
      // Ops visibility: when the daily cron ran and what it did (counts only).
      let lastCron: unknown = null;
      try {
        if (access.identity.idToken !== "demo-token") {
          const { adminConfigured, getAdminDatabase } = await import("@/lib/geo/admin-store");
          if (adminConfigured()) lastCron = (await (await getAdminDatabase()).ref("geo/ops/lastCron").get()).val();
        }
      } catch {
        lastCron = null;
      }
      return Response.json({
        ...state,
        plan,
        lastCron,
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
