import type { AuditEvent, AuditStore } from "./audit.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

// Append-only: push() generates a new key per event; there are no set/update
// methods on this surface.
export class RtdbAuditStore implements AuditStore {
  async append(event: AuditEvent): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(event.tenantId)}/audit`).push(event);
  }

  async list(tenantId: string, limit = 200): Promise<AuditEvent[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/audit`).orderByChild("at").limitToLast(limit).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, AuditEvent>).filter((e) => e.tenantId === tenantId);
  }
}
