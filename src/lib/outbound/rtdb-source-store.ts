// RTDB-backed LicensedSourceStore. Source ids are deterministic per
// tenant+name, so re-registering the same name updates in place; listing
// filters tenant-side like every other store.

import { tenantRoot } from "./rtdb-store.ts";
import type { LicensedSource, LicensedSourceStore } from "./discovery.ts";

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

export class RtdbLicensedSourceStore implements LicensedSourceStore {
  async save(source: LicensedSource): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(source.tenantId)}/licensedSources/${safeKey(source.sourceId)}`).set(source);
  }
  async list(tenantId: string): Promise<LicensedSource[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/licensedSources`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, LicensedSource>).filter((s) => s && s.tenantId === tenantId);
  }
}
