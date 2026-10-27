// RTDB-backed PreflightStore. Domains are hashed into keys (dots are not
// valid in RTDB path segments); the record itself carries the domain.

import type { DomainPreflight, PreflightStore } from "./preflight.ts";
import { domainKey } from "./preflight.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

export class RtdbPreflightStore implements PreflightStore {
  async save(record: DomainPreflight): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(record.tenantId)}/domainPreflight/${domainKey(record.domain)}`).set(record);
  }
  async get(tenantId: string, domain: string): Promise<DomainPreflight | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/domainPreflight/${domainKey(domain)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as DomainPreflight;
    return val.tenantId === tenantId ? val : null;
  }
  async list(tenantId: string): Promise<DomainPreflight[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/domainPreflight`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, DomainPreflight>).filter((r) => r && r.tenantId === tenantId);
  }
}
