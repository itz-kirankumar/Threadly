// RTDB-backed LedgerStore. Tenant isolation is structural: every path is
// rooted at outbound/<tenantId>/..., and every read verifies the stored
// tenantId matches the requested tenant (never trusts the caller's object).
//
// Atomicity:
// - createIntentIfAbsent: transaction on the unique-key index; the intent
//   write is idempotent and repaired if an index hit points at a missing
//   intent (crash between the two writes).
// - compareAndSetStatus: single-path transaction checking tenant + status.

import { createHash } from "node:crypto";
import type { DeliveryAttempt, MessageIntent, MessageStatus } from "./types.ts";
import type { LedgerStore } from "./ledger.ts";

export function intentKeyHash(uniqueKey: string): string {
  return createHash("sha256").update(uniqueKey).digest("hex").slice(0, 40);
}

export function outboundDataRoot(): string {
  // Isolation invariant: test/preview contexts must set OUTBOUND_DATA_ROOT to
  // a non-production root (e.g. "outbound-test") so enabled writes can never
  // touch production tenant data. Production rollout sets it explicitly too.
  const root = process.env.OUTBOUND_DATA_ROOT ?? "outbound";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(root)) throw new Error("invalid OUTBOUND_DATA_ROOT");
  return root;
}

export function tenantRoot(tenantId: string): string {
  // RTDB keys cannot contain . $ # [ ] / ; tenant ids here are workspace uids
  // (safe charset), but validate defensively.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) throw new Error("invalid tenant id");
  return `${outboundDataRoot()}/${tenantId}`;
}

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

export class RtdbLedgerStore implements LedgerStore {
  async createIntentIfAbsent(intent: MessageIntent): Promise<"created" | "duplicate"> {
    const root = tenantRoot(intent.tenantId);
    const hash = intentKeyHash(intent.uniqueKey);
    const database = await db();
    const indexRef = database.ref(`${root}/intentKeys/${hash}`);
    const tx = await indexRef.transaction((current: string | null) => {
      if (current) return; // abort: key claimed
      return intent.intentId;
    });
    if (!tx.committed) {
      // Possible crash-between-writes: index claimed, intent missing. Repair
      // only if the indexed id matches and the intent is absent; otherwise a
      // true duplicate.
      const indexed = (await indexRef.get()).val() as string | null;
      if (indexed === intent.intentId) {
        const snap = await database.ref(`${root}/intents/${intent.intentId}`).get();
        if (!snap.exists()) {
          await database.ref(`${root}/intents/${intent.intentId}`).set(intent);
          return "created";
        }
      }
      return "duplicate";
    }
    await database.ref(`${root}/intents/${intent.intentId}`).set(intent);
    return "created";
  }

  async getIntent(tenantId: string, intentId: string): Promise<MessageIntent | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/intents/${intentId}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as MessageIntent;
    if (val.tenantId !== tenantId || val.intentId !== intentId) return null;
    return val;
  }

  async findIntentByUniqueKey(uniqueKey: string): Promise<MessageIntent | null> {
    // uniqueKey embeds the tenant id as its first segment (see intentUniqueKey).
    const tenantId = uniqueKey.split(":")[0];
    const database = await db();
    const root = tenantRoot(tenantId);
    const snap = await database.ref(`${root}/intentKeys/${intentKeyHash(uniqueKey)}`).get();
    if (!snap.exists()) return null;
    return this.getIntent(tenantId, snap.val() as string);
  }

  async compareAndSetStatus(
    tenantId: string,
    intentId: string,
    expected: MessageStatus,
    next: MessageIntent
  ): Promise<boolean> {
    // ETag compare-and-put over the RTDB REST API: genuinely atomic, and not
    // dependent on the client SDK's local transaction cache (which aborts on
    // a stale empty cache in fresh serverless processes).
    const database = await db();
    const app = (database as unknown as { app: { options: { databaseURL?: string }; } }).app;
    const base = (app.options.databaseURL ?? "").replace(/\/$/, "");
    if (!base) throw new Error("RTDB databaseURL missing");
    const credential = (app as unknown as { options: { credential?: { getAccessToken(): Promise<{ access_token: string }> } } }).options.credential;
    if (!credential) throw new Error("RTDB admin credential missing");
    const path = `${tenantRoot(tenantId)}/intents/${intentId}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = (await credential.getAccessToken()).access_token;
      const getRes = await fetch(`${base}/${path}.json?access_token=${encodeURIComponent(token)}`, { cache: "no-store", headers: { "X-Firebase-ETag": "true" } });
      if (!getRes.ok) throw new Error(`cas_read_failed:${getRes.status}`);
      const etag = getRes.headers.get("ETag") ?? getRes.headers.get("etag");
      const current = (await getRes.json()) as MessageIntent | null;
      if (!current || current.tenantId !== tenantId || current.status !== expected) return false; // real conflict
      if (!etag) throw new Error("cas_etag_missing");
      const putRes = await fetch(`${base}/${path}.json?access_token=${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "if-match": etag },
        body: JSON.stringify(next),
      });
      if (putRes.ok) return true;
      if (putRes.status === 412) continue; // lost the race; retry against fresh state
      throw new Error(`cas_write_failed:${putRes.status}`);
    }
    return false;
  }

  async appendAttempt(attempt: DeliveryAttempt): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(attempt.tenantId)}/attempts/${attempt.intentId}/${attempt.attemptId}`).set(attempt);
  }

  async listAttempts(tenantId: string, intentId: string): Promise<DeliveryAttempt[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/attempts/${intentId}`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, DeliveryAttempt>);
  }
}
