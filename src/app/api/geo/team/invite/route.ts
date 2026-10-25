import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { createInvite, removeInvite, resolveWorkspaceAccess } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: create a shareable invite link (owner and admins only).
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!access.teamsEnabled) throw new RequestError("Team sharing is being enabled for this deployment.", 503);
    const body = (await readJsonBody(request, 4 * 1024).catch(() => ({}))) as { role?: unknown };
    const role = body.role === "admin" ? "admin" : "member";
    const invite = await createInvite(access, role);
    return Response.json({ invite });
  } catch (error) {
    return errorResponse(error, "Create invite");
  }
}

// DELETE: revoke an invite link (owner and admins only).
export async function DELETE(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!access.teamsEnabled) throw new RequestError("Team sharing is being enabled for this deployment.", 503);
    const body = (await readJsonBody(request, 4 * 1024)) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token) throw new RequestError("Missing invite token.", 400);
    await removeInvite(access.workspaceUid, body.token);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Revoke invite");
  }
}
