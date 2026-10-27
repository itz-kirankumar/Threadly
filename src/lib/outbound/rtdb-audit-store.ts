import type { AuditEvent, AuditStore } from "./audit.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

// Append-only at this surface: events are written once under their own
// eventId key; there are no update or delete methods for the primary log.
// Keyed writes (rather than push) make recovery replays idempotent: replaying
// the same event twice writes the same key.
export class RtdbAuditStore implements AuditStore {
  // Every append first runs a bounded recovery sweep so degraded records
  // replay automatically on the next mutation. A sweep failure never blocks
  // the append itself.
  async append(event: AuditEvent): Promise<void> {
    try {
      await this.recoverDegraded(event.tenantId);
    } catch (error) {
      console.error("audit recovery sweep failed; continuing with append", {
        cause: error instanceof Error ? error.message : "unknown",
      });
    }
    const database = await db();
    await database.ref(`${tenantRoot(event.tenantId)}/audit/${event.eventId}`).set(event);
  }

  // Separate durable path from the primary audit log: survives whatever made
  // the primary append fail (index/rules/payload issues on /audit). Keyed by
  // eventId so a retried degraded write never duplicates.
  async appendDegraded(event: AuditEvent, cause: string): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(event.tenantId)}/auditFallback/${event.eventId}`).set({ event, cause });
  }

  // Replay fallback records into the primary log, then remove each replayed
  // fallback entry. Replay is keyed by eventId, so an entry whose fallback
  // removal fails is overwritten (not duplicated) on the next sweep. A
  // record whose replay fails stays on the fallback path.
  async recoverDegraded(tenantId: string, limit = 25): Promise<{ recovered: number; remaining: number }> {
    const database = await db();
    const base = `${tenantRoot(tenantId)}/auditFallback`;
    const snap = await database.ref(base).limitToFirst(limit).get();
    if (!snap.exists()) return { recovered: 0, remaining: 0 };
    const entries = Object.entries(snap.val() as Record<string, { event: AuditEvent; cause: string }>);
    let recovered = 0;
    for (const [key, entry] of entries) {
      if (!entry?.event?.eventId) {
        await database.ref(`${base}/${key}`).remove();
        continue;
      }
      try {
        await database.ref(`${tenantRoot(tenantId)}/audit/${entry.event.eventId}`).set(entry.event);
        await database.ref(`${base}/${key}`).remove();
        recovered += 1;
      } catch {
        // stays on the fallback path for the next sweep
      }
    }
    const rest = await database.ref(base).get();
    const remaining = rest.exists() ? Object.keys(rest.val() as Record<string, unknown>).length : 0;
    return { recovered, remaining };
  }

  async list(tenantId: string, limit = 200): Promise<AuditEvent[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/audit`).orderByChild("at").limitToLast(limit).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, AuditEvent>).filter((e) => e.tenantId === tenantId);
  }
}
