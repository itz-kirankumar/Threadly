import { errorResponse } from "@/lib/api-request";
import { getAdminAuth, getAdminDatabase } from "@/lib/geo/admin-store";
import { adminGetMembership, loadTeam } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Account deletion must not start within this window of the user's last
// sign-in. Enforced server-side from the token's auth_time BEFORE any
// destructive write, so a stale-session failure leaves both the account
// and its data untouched.
const MAX_SIGN_IN_AGE_SECONDS = 15 * 60;

// Permanently delete the caller's account: data trees via Admin SDK, then
// the Firebase Auth user itself (Admin deletion cannot fail for recency).
// The client only calls this; it never deletes the user itself.
export async function DELETE(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!idToken) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (idToken === "demo-token") return Response.json({ error: "Demo sessions cannot be deleted." }, { status: 400 });

    const auth = await getAdminAuth();
    let uid: string;
    let authTime: number;
    try {
      const decoded = await auth.verifyIdToken(idToken);
      uid = decoded.uid;
      authTime = decoded.auth_time;
    } catch {
      return Response.json({ error: "Your sign-in could not be verified. Sign in again." }, { status: 401 });
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - authTime;
    if (ageSeconds > MAX_SIGN_IN_AGE_SECONDS) {
      return Response.json(
        { error: "For security, account deletion needs a recent sign-in. Sign out, sign back in, and try again." },
        { status: 403 },
      );
    }

    const db = await getAdminDatabase();
    const membership = await adminGetMembership(uid);
    if (membership && membership.ownerUid !== uid) {
      // Guest in someone else's workspace: leave it cleanly.
      await db.ref(`users/${membership.ownerUid}/geo/team/members/${uid}`).set(null);
    }

    // Own workspace: refuse while other members depend on it.
    const team = await loadTeam(uid);
    if (team.members.length > 0) {
      return Response.json(
        { error: "Remove every team member from your workspace before deleting your account." },
        { status: 409 },
      );
    }
    for (const invite of team.invites) {
      await db.ref(`invites/${invite.token}`).set(null);
    }

    // Destructive writes happen only after every guard above has passed.
    await db.ref(`users/${uid}`).set(null);
    await db.ref(`memberships/${uid}`).set(null);
    await auth.deleteUser(uid);

    return Response.json({ deleted: true });
  } catch (error) {
    // TEMP-DEBUG: surface the real failure while diagnosing the 500.
    return Response.json({ error: `DBG: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
