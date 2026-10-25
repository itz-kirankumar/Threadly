import { errorResponse } from "@/lib/api-request";
import { getFirebaseIdentity } from "@/lib/portal-db";
import { getAdminDatabase } from "@/lib/geo/admin-store";
import { adminGetMembership, loadTeam } from "@/lib/geo/team";

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

    // Destructive steps happen only after every guard above has passed.
    // The Auth user goes FIRST: it is the only step that can fail for
    // recency, and once it is gone no active session can outlive deleted
    // data. Data deletion via Admin SDK cannot fail for recency.
    const apiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey ?? "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: identity.idToken }),
      cache: "no-store",
    });
    if (!response.ok) {
      return Response.json(
        { error: "For security, account deletion needs a recent sign-in. Sign out, sign back in, and try again." },
        { status: 403 },
      );
    }

    await db.ref(`users/${uid}`).set(null);
    await db.ref(`memberships/${uid}`).set(null);

    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "Delete account");
  }
}
