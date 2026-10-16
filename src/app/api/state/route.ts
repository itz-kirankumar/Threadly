import { getState } from "@/lib/portal-data";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { getGrowthSnapshot } from "@/lib/threadly-engine";
import { errorResponse } from "@/lib/api-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    return await withWorkspace(user.uid, user.idToken, async () => {
      const state = await getState(user.uid);
      const growth = await getGrowthSnapshot(user.uid, state.leads);
      return Response.json({ ...state, growth });
    });
  } catch (error) {
    return errorResponse(error, "Workspace state");
  }
}
