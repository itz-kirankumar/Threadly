import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { createInvite, inWorkspace, loadTeam, removeInvite, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadPlan, planAtLeast, PLAN_LIMITS, planBlockResponse } from "@/lib/geo/plan";
import { appendAudit } from "@/lib/geo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: create a shareable invite link (owner and admins only).
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    // Roles and invite links, capped by the plan's seats where it has a cap.
    const planCheck = await inWorkspace(access, async () => {
      const plan = await loadPlan(access.identity.email);
      // Pro and above, or credit workspaces (no seat fees).
      if (!planAtLeast(plan, "pro") && plan !== "none") return { blocked: planBlockResponse("Roles and invite links are not included in the trial.", plan) };
      const seats = PLAN_LIMITS[plan].seats;
      if (seats != null) {
        const team = await loadTeam(access.workspaceUid);
        // seats count every person in the workspace, including the owner.
        if (team.members.length + team.invites.length >= seats - 1) {
          return { blocked: planBlockResponse(`Your plan includes ${seats} seats and they are all taken - remove a member or upgrade.`, plan) };
        }
      }
      return { blocked: null };
    });
    if (planCheck.blocked) return planCheck.blocked;
    if (!access.teamsEnabled) throw new RequestError("Team sharing is being enabled for this deployment.", 503);
    const body = (await readJsonBody(request, 4 * 1024).catch(() => ({}))) as { role?: unknown };
    const role = body.role === "admin" ? "admin" : "member";
    const invite = await createInvite(access, role);
    await inWorkspace(access, () =>
      appendAudit({ actor: access.identity.email, action: "invite.created", detail: `role ${role}` }),
    );
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
