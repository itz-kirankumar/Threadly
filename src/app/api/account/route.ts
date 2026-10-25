import { errorResponse } from "@/lib/api-request";
import { getFirebaseIdentity } from "@/lib/portal-db";
import { getAdminDatabase } from "@/lib/geo/admin-store";
import { adminGetMembership, loadTeam } from "@/lib/geo/team";
import { executeDeletion } from "@/lib/geo/pending-deletions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Account deletion must not start within this window of the user's last
// sign-in. Enforced server-side from the token's auth_time BEFORE any
// destructive write, so a stale-session failure leaves both the account
// and its data untouched.
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

// auth_time from the token's own claims. The token has already been
// validated by Google's accounts:lookup in getFirebaseIdentity, so the
// payload of this exact token string is trustworthy without re-verifying
// the signature (which pulls ESM-only deps that break in the bundle).
function tokenAuthTime(idToken: string): number | null {
  try {
    const part = idToken.split(".")[1];
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { auth_time?: number };
    return typeof payload.auth_time === "number" ? payload.auth_time : null;
  } catch {
    return null;
  }
}

// Permanently delete the caller's account: data trees via Admin SDK, then
// the Firebase Auth user via accounts:delete with the caller's own (fresh)
// token. Every guard runs before the first destructive write.
export async function DELETE(request: Request) {
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (identity.idToken === "demo-token") return Response.json({ error: "Demo sessions cannot be deleted." }, { status: 400 });

    const authTime = tokenAuthTime(identity.idToken);
    if (!authTime || Math.floor(Date.now() / 1000) - authTime > MAX_SIGN_IN_AGE_SECONDS) {
      return Response.json(
        { error: "For security, account deletion needs a recent sign-in. Sign out, sign back in, and try again." },
        { status: 403 },
      );
    }

    const db = await getAdminDatabase();
    const uid = identity.uid;
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

    const outcome = await executeDeletion(db, uid, identity.idToken);
    switch (outcome.kind) {
      case "intent-failed":
        return Response.json(
          { error: "Could not start account deletion safely. Nothing was changed - please try again." },
          { status: 503 },
        );
      case "auth-rejected":
        return Response.json(
          { error: "For security, account deletion needs a recent sign-in. Sign out, sign back in, and try again." },
          { status: 403 },
        );
      case "wipe-failed":
        return Response.json(
          {
            error: "Your sign-in was removed, but clearing your stored data failed. It is queued and will be removed automatically by the next scheduled cleanup.",
            authDeleted: true,
            dataRemoved: false,
            cleanupQueued: true,
          },
          { status: 502 },
        );
      case "deleted":
        return Response.json({ deleted: true });
    }
  } catch (error) {
    return errorResponse(error, "Delete account");
  }
}
