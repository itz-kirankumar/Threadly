// RTDB-backed IcpStore. Versions are immutable records keyed by id; the
// confirmation write uses REST ETag CAS so a concurrent confirm of the same
// draft cannot double-confirm. Listing reads the node and sorts in memory
// (no orderByChild - shared rules have no .indexOn for it).

import { rtdbCasPut, tenantRoot } from "./rtdb-store.ts";
import type { IcpStore, IcpVersion } from "./icp.ts";

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

// RTDB drops null fields; confirmed/activated markers must read as explicit
// null (confirmed without activatedAt = never activated, fail closed).
export function normalizeIcp(v: IcpVersion): IcpVersion {
  return { ...v, confirmedAt: v.confirmedAt ?? null, confirmedBy: v.confirmedBy ?? null, activatedAt: v.activatedAt ?? null };
}

export class RtdbIcpStore implements IcpStore {
  async save(version: IcpVersion): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(version.tenantId)}/icpVersions/${safeKey(version.icpVersionId)}`).set(version);
  }
  async get(tenantId: string, icpVersionId: string): Promise<IcpVersion | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/icpVersions/${safeKey(icpVersionId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as IcpVersion;
    return val.tenantId === tenantId ? normalizeIcp(val) : null;
  }
  async list(tenantId: string): Promise<IcpVersion[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/icpVersions`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, IcpVersion>).map((v) => normalizeIcp(v))
      .filter((v) => v && v.tenantId === tenantId)
      .sort((a, b) => b.version - a.version);
  }

  async getCurrentId(tenantId: string): Promise<string | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/icpCurrent`).get();
    if (!snap.exists()) return null;
    return snap.val() as string;
  }

  async casSetCurrent(tenantId: string, expectedCurrentId: string | null, nextCurrentId: string): Promise<boolean> {
    return rtdbCasPut<string | null>(
      `${tenantRoot(tenantId)}/icpCurrent`,
      (current) => (current ?? null) === expectedCurrentId,
      nextCurrentId,
    );
  }

  // CAS transition for confirmation: only writes when the stored record is
  // still the expected draft. Returns false on a concurrent transition.
  async casConfirm(expectedDraft: IcpVersion, confirmed: IcpVersion): Promise<boolean> {
    const path = `${tenantRoot(expectedDraft.tenantId)}/icpVersions/${safeKey(expectedDraft.icpVersionId)}`;
    return rtdbCasPut<IcpVersion>(
      path,
      (current) => current !== null && current.status === "draft" && current.version === expectedDraft.version,
      confirmed,
    );
  }
}
