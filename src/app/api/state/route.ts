import { getState } from "@/lib/portal-data";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { errorResponse } from "@/lib/api-request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    return await withWorkspace(user.uid, user.idToken, async () => Response.json(await getState(user.uid)));
  } catch (error) {
    return errorResponse(error, "Workspace state");
  }
}


