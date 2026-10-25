import { errorResponse } from "@/lib/api-request";
import { adminConfigured, getAdminDatabase } from "@/lib/geo/admin-store";
import { loadTeam, resolveWorkspaceAccess, type TeamMember } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: this workspace's team - caller's role, members, active invite links.
export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    if (access.identity.idToken === "demo-token" || !adminConfigured()) {
      return Response.json({
        teamsEnabled: false,
        role: "owner",
        shared: false,
        members: [],
        invites: [],
      });
    }
    const { members, invites } = await loadTeam(access.workspaceUid);

    // Keep the owner's public profile record fresh so members can see who
    // owns the workspace they joined.
    if (!access.shared) {
      await (await getAdminDatabase()).ref(`users/${access.identity.uid}/profile`).set({
        name: access.identity.name,
        email: access.identity.email,
      });
    }

    let owner: TeamMember | null = null;
    if (access.shared) {
      // Member's view: resolve the workspace owner's public identity from
      // the owner's profile record if present.
      const snapshot = await (await getAdminDatabase()).ref(`users/${access.workspaceUid}/profile`).get();
      const profile = snapshot.val() as { name?: string; email?: string } | null;
      owner = {
        uid: access.workspaceUid,
        email: profile?.email ?? "",
        name: profile?.name ?? "Workspace owner",
        role: "owner",
        addedAt: "",
      };
    }

    return Response.json({
      teamsEnabled: true,
      role: access.role,
      shared: access.shared,
      owner,
      members,
      invites: access.role === "member" ? [] : invites,
    });
  } catch (error) {
    return errorResponse(error, "Team");
  }
}
