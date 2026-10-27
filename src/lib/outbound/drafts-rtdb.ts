// RTDB-backed DraftStore. Draft content is plain template output (no secrets).

import type { Draft, DraftStore } from "./drafts.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

export class RtdbDraftStore implements DraftStore {
  async saveDraft(d: Draft): Promise<void> {
    await (await db()).ref(`${tenantRoot(d.tenantId)}/drafts/${d.draftId}`).set(d);
  }
  async getDraftForIntent(tenantId: string, intentId: string): Promise<Draft | null> {
    const all = await this.listDrafts(tenantId);
    return all.find((d) => d.intentId === intentId) ?? null;
  }
  async listDrafts(tenantId: string): Promise<Draft[]> {
    const snap = await (await db()).ref(`${tenantRoot(tenantId)}/drafts`).get();
    const val = snap.val() as Record<string, Draft> | null;
    if (!val) return [];
    return Object.values(val).filter((d) => d.tenantId === tenantId);
  }
}
