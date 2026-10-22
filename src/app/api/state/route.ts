import { getState } from "@/lib/portal-data";
import { withWorkspace } from "@/lib/portal-db";
import { requireApprovedIdentity } from "@/lib/admin-auth";
import { getGrowthSnapshot } from "@/lib/threadly-engine";
import { errorResponse } from "@/lib/api-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApprovedIdentity(request);
    return await withWorkspace(user.uid, user.idToken, async () => {
      const state = await getState(user.uid);
      const growth = await getGrowthSnapshot(
        user.uid,
        state.leads,
        state.opportunities,
        state.drafts,
        state.outreachEmails,
        state.workspace
      );
      return Response.json({ ...state, growth });
    });
  } catch (error) {
    return errorResponse(error, "Workspace state");
  }
}
