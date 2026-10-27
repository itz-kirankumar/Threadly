// RTDB-backed FitScoreStore. Results nest under the contact so per-contact
// history reads stay small; listing reads the node and sorts in memory (no
// orderByChild - the shared rules have no .indexOn for it).

import type { FitScoreResult, FitScoreStore } from "./scoring.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function safeKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("invalid key");
  return id;
}

export class RtdbFitScoreStore implements FitScoreStore {
  async save(result: FitScoreResult): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(result.tenantId)}/fitScores/${safeKey(result.contactId)}/${safeKey(result.scoreId)}`).set(result);
  }
  async listForContact(tenantId: string, contactId: string): Promise<FitScoreResult[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/fitScores/${safeKey(contactId)}`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, FitScoreResult>)
      .filter((r) => r && r.tenantId === tenantId)
      .sort((a, b) => b.computedAt.localeCompare(a.computedAt));
  }
  async latest(tenantId: string, contactId: string): Promise<FitScoreResult | null> {
    return (await this.listForContact(tenantId, contactId))[0] ?? null;
  }
  async list(tenantId: string): Promise<FitScoreResult[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/fitScores`).get();
    if (!snap.exists()) return [];
    const all: FitScoreResult[] = [];
    for (const byScore of Object.values(snap.val() as Record<string, Record<string, FitScoreResult>>)) {
      for (const r of Object.values(byScore)) {
        if (r && r.tenantId === tenantId) all.push(r);
      }
    }
    return all.sort((a, b) => b.computedAt.localeCompare(a.computedAt));
  }
}
