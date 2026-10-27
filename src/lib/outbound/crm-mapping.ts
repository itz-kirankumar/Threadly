// CRM mapping: links internal contacts/activities to external CRM objects
// (HubSpot only in the pilot). Mappings are records only; no live CRM sync
// runs from this surface yet.

import type { CRMMapping } from "./types.ts";
import { tenantRoot } from "./rtdb-store.ts";

export interface CRMMappingStore {
  saveMapping(m: CRMMapping): Promise<void>;
  findByExternalId(tenantId: string, externalObjectType: string, externalId: string): Promise<CRMMapping | null>;
  findByInternalRef(tenantId: string, kind: "contact" | "activity", id: string): Promise<CRMMapping | null>;
  listMappings(tenantId: string): Promise<CRMMapping[]>;
}

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function safeKey(id: string): string {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new Error("invalid key");
  return id;
}

export class RtdbCRMMappingStore implements CRMMappingStore {
  async saveMapping(m: CRMMapping): Promise<void> {
    const database = await db();
    const root = tenantRoot(m.tenantId);
    await database.ref(`${root}/crmMappings/${safeKey(m.mappingId)}`).set(m);
    await database.ref(`${root}/crmByExternal/${safeKey(m.externalObjectType)}/${safeKey(m.externalId)}`).set(m.mappingId);
    await database.ref(`${root}/crmByInternal/${m.internalRef.kind}/${safeKey(m.internalRef.id)}`).set(m.mappingId);
  }

  private async getById(tenantId: string, mappingId: string): Promise<CRMMapping | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/crmMappings/${safeKey(mappingId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as CRMMapping;
    return val.tenantId === tenantId ? val : null;
  }

  async findByExternalId(tenantId: string, externalObjectType: string, externalId: string): Promise<CRMMapping | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/crmByExternal/${safeKey(externalObjectType)}/${safeKey(externalId)}`).get();
    if (!snap.exists()) return null;
    return this.getById(tenantId, snap.val() as string);
  }

  async findByInternalRef(tenantId: string, kind: "contact" | "activity", id: string): Promise<CRMMapping | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/crmByInternal/${kind}/${safeKey(id)}`).get();
    if (!snap.exists()) return null;
    return this.getById(tenantId, snap.val() as string);
  }

  async listMappings(tenantId: string): Promise<CRMMapping[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/crmMappings`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, CRMMapping>).filter((m) => m.tenantId === tenantId);
  }
}
