// RTDB-backed RetentionOverrideStore. Read-only for now: no route creates
// override records because activating contract terms is an owner decision.
// Records (when they exist, written by a future owner-approved path) live
// under the tenant root like all tenant data.

import type { RetentionOverride, RetentionOverrideStore } from "./retention.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

export class RtdbRetentionOverrideStore implements RetentionOverrideStore {
  async listOverrides(tenantId: string): Promise<RetentionOverride[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/retentionOverrides`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, RetentionOverride>).filter((o) => o && o.tenantId === tenantId);
  }
}
