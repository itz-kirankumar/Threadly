import { getFirebaseIdentity } from "@/lib/portal-db";
import { errorResponse } from "@/lib/api-request";
import { getAdminDatabase } from "@/lib/geo/admin-store";
import { adminGetMembership, loadTeam } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Permanently delete the caller's account data. The Firebase user itself is
// deleted client-side after this call succeeds. Order matters: the API runs
// while the id token is still valid.
export async function DELETE(request: Request) {
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) throw new Error("Sign in to continue.");
    if (identity.idToken === "demo-token") throw new Error("Demo sessions cannot be deleted.");

    const db = await getAdminDatabase();
    const membership = await adminGetMembership(identity.uid);

    if (membership && membership.ownerUid !== identity.uid) {
      // Guest in someone else's workspace: leave it cleanly.
      await db.ref(`users/${membership.ownerUid}/geo/team/members/${identity.uid}`).set(null);
    }

    // Own workspace: refuse while other members depend on it.
    const team = await loadTeam(identity.uid);
    if (team.members.length > 0) {
      return Response.json(
        { error: "Remove every team member from your workspace before deleting your account." },
        { status: 409 },
      );
    }
    for (const invite of team.invites) {
      await db.ref(`invites/${invite.token}`).set(null);
    }

    await db.ref(`users/${identity.uid}`).set(null);
    await db.ref(`memberships/${identity.uid}`).set(null);

    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "Delete account");
  }
}
