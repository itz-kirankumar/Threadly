import { errorResponse } from "@/lib/api-request";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { loadKeySettings, loadWorkspace } from "@/lib/geo/store";
import { providerKeyStatuses } from "@/lib/geo/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    return await withWorkspace(user!.uid, user!.idToken, async () => {
      const [state, keySettings] = await Promise.all([loadWorkspace(), loadKeySettings()]);
      state.providers = providerKeyStatuses(keySettings);
      return Response.json(state);
    });
  } catch (error) {
    return errorResponse(error, "GEO state");
  }
}
