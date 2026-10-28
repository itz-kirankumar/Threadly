// RTDB-backed KillSwitchStore, under the tenant root like all tenant data.
// lift() reads, re-verifies tenant, then writes: a lifted record is never
// resurrected and a record is never moved across tenants.

import type { ISODate } from "./types.ts";
import type { KillSwitch, KillSwitchStore } from "./kill-switches.ts";
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

// RTDB drops null-valued fields on write; normalize on read so nullable
// fields always come back as explicit null (never undefined). A missing
// liftedAt MUST mean "still active" - undefined would silently read as
// lifted in strict-null checks and disable the safety control.
export function normalizeKillSwitch(s: KillSwitch): KillSwitch {
  return { ...s, liftedAt: s.liftedAt ?? null };
}

export class RtdbKillSwitchStore implements KillSwitchStore {
  async save(s: KillSwitch): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(s.tenantId)}/killSwitches/${safeKey(s.switchId)}`).set(s);
  }
  async get(tenantId: string, switchId: string): Promise<KillSwitch | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/killSwitches/${safeKey(switchId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as KillSwitch;
    return val.tenantId === tenantId ? normalizeKillSwitch(val) : null;
  }
  async list(tenantId: string): Promise<KillSwitch[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/killSwitches`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, KillSwitch>).filter((s) => s && s.tenantId === tenantId).map(normalizeKillSwitch);
  }
  async lift(tenantId: string, switchId: string, liftedAt: ISODate): Promise<void> {
    const existing = await this.get(tenantId, switchId);
    if (!existing) throw new Error(`kill switch ${switchId} not found`);
    await this.save({ ...existing, liftedAt });
  }
}
