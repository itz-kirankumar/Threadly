import { authUserExists } from "@/lib/geo/auth-existence";

// Account-deletion recovery, shared by the account route and the cron
// sweeper. A tombstone at pendingDeletions/<uid> is written BEFORE the
// irreversible Auth deletion, so an interrupted request can always be
// reconciled:
//   state "pending"     - intent recorded, Auth deletion not yet confirmed.
//   state "authDeleted" - Auth user confirmed gone; data wipe may remain.
// The sweeper wipes data only when the Auth user is confirmed gone. It never
// wipes a still-active user's data.

export interface DeletionDb {
  ref(path: string): {
    set(value: unknown): Promise<unknown>;
    get(): Promise<{ val(): unknown }>;
  };
}

export type DeletionOutcome =
  | { kind: "intent-failed" }
  | { kind: "auth-rejected" }
  | { kind: "wipe-failed" }
  | { kind: "deleted" };

// Runs the destructive half of account deletion for an already-authenticated,
// already-guarded caller. Every step is ordered so a failure leaves a
// recoverable state and an honest outcome.
export async function executeDeletion(db: DeletionDb, uid: string, idToken: string): Promise<DeletionOutcome> {
  // 1. Persist intent BEFORE the irreversible step. Abort clean if we can't.
  try {
    await db.ref(`pendingDeletions/${uid}`).set({ uid, state: "pending", queuedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Account deletion: could not persist deletion intent, aborting", uid, error);
    return { kind: "intent-failed" };
  }

  // 2. Irreversible Auth deletion with the caller's own fresh token.
  const apiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey ?? "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });
  if (!response.ok) {
    // Nothing destructive happened. Clear the intent (best effort) and fail clean.
    try {
      await db.ref(`pendingDeletions/${uid}`).set(null);
    } catch (clearError) {
      console.error("Account deletion: auth delete rejected and tombstone cleanup failed", uid, clearError);
    }
    return { kind: "auth-rejected" };
  }

  // 3. Auth user is confirmed gone - record that before the wipe.
  try {
    await db.ref(`pendingDeletions/${uid}`).set({ uid, state: "authDeleted", authDeletedAt: new Date().toISOString() });
  } catch (markError) {
    console.error("Account deletion: auth removed but authDeleted marker write failed", uid, markError);
  }

  // 4. Data wipe. On failure the authDeleted tombstone stays for the sweeper.
  try {
    await db.ref(`users/${uid}`).set(null);
    await db.ref(`memberships/${uid}`).set(null);
  } catch (wipeError) {
    console.error("Account deletion: auth removed but data wipe failed; sweeper will retry", uid, wipeError);
    return { kind: "wipe-failed" };
  }
  await db.ref(`pendingDeletions/${uid}`).set(null);
  return { kind: "deleted" };
}

export interface SweepResult {
  swept: string[];
  clearedStale: string[];
  skipped: string[];
}

const PENDING_GRACE_MS = 10 * 60 * 1000;

export async function reconcilePendingDeletions(
  db: DeletionDb,
  existsFn: (uid: string) => Promise<boolean | null> = authUserExists,
): Promise<SweepResult> {
  const result: SweepResult = { swept: [], clearedStale: [], skipped: [] };
  const snapshot = await db.ref("pendingDeletions").get();
  const tombstones: Array<{ uid?: string; state?: string; queuedAt?: string }> = Object.values(
    (snapshot.val() || {}) as Record<string, { uid?: string; state?: string; queuedAt?: string }>,
  );
  for (const tombstone of tombstones) {
    if (!tombstone?.uid) continue;
    let confirmedGone = tombstone.state === "authDeleted";
    if (!confirmedGone) {
      const age = Date.now() - new Date(tombstone.queuedAt || 0).getTime();
      if (!(age > PENDING_GRACE_MS)) {
        result.skipped.push(tombstone.uid); // request may still be in flight
        continue;
      }
      const exists = await existsFn(tombstone.uid);
      if (exists === true) {
        // Auth deletion never happened: active user. Clear the stale intent
        // and leave every byte of their data alone.
        await db.ref(`pendingDeletions/${tombstone.uid}`).set(null);
        result.clearedStale.push(tombstone.uid);
        console.error("Cron: cleared stale deletion intent for still-active user", tombstone.uid);
        continue;
      }
      if (exists === null) {
        result.skipped.push(tombstone.uid); // unknown: retry next sweep
        continue;
      }
      confirmedGone = true;
    }
    try {
      await db.ref(`users/${tombstone.uid}`).set(null);
      await db.ref(`memberships/${tombstone.uid}`).set(null);
      await db.ref(`pendingDeletions/${tombstone.uid}`).set(null);
      result.swept.push(tombstone.uid);
    } catch (retryError) {
      console.error("Cron: pending deletion retry failed for", tombstone.uid, retryError);
      result.skipped.push(tombstone.uid);
    }
  }
  return result;
}
