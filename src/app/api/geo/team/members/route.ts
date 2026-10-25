import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { removeMember, resolveWorkspaceAccess, updateMemberRole } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH: change a member's role (owner only; the owner role itself never changes).
export async function PATCH(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!access.teamsEnabled) throw new RequestError("Team sharing is being enabled for this deployment.", 503);
    if (access.role !== "owner") throw new RequestError("Only the workspace owner can change roles.", 403);
    const body = (await readJsonBody(request, 4 * 1024)) as { uid?: unknown; role?: unknown };
    if (typeof body.uid !== "string" || !body.uid) throw new RequestError("Missing member id.", 400);
    if (body.role !== "admin" && body.role !== "member") throw new RequestError("Role must be admin or member.", 400);
    await updateMemberRole(access.workspaceUid, body.uid, body.role);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Change role");
  }
}

// DELETE: remove a member. Owners and admins remove others; anyone can leave.
export async function DELETE(request: Request) {
  try {
    const body = (await readJsonBody(request, 4 * 1024)) as { uid?: unknown };
    const removing = typeof body.uid === "string" && body.uid ? body.uid : null;
    const access = await resolveWorkspaceAccess(request, removing ? "manageTeam" : "view");
    if (!access.teamsEnabled) throw new RequestError("Team sharing is being enabled for this deployment.", 503);

    if (!removing || removing === access.identity.uid) {
      // Leaving a shared workspace you were invited to.
      if (!access.shared) throw new RequestError("You own this workspace.", 400);
      await removeMember(access.workspaceUid, access.identity.uid);
      return Response.json({ ok: true, left: true });
    }
    if (removing === access.workspaceUid) throw new RequestError("The owner cannot be removed.", 400);
    if (access.role === "admin") {
      // Admins can remove members, not other admins.
      const { loadTeam } = await import("@/lib/geo/team");
      const { members } = await loadTeam(access.workspaceUid);
      const target = members.find((m) => m.uid === removing);
      if (target && target.role !== "member") throw new RequestError("Admins can only remove members.", 403);
    }
    await removeMember(access.workspaceUid, removing);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Remove member");
  }
}
