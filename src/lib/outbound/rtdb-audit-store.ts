import type { AuditEvent, AuditStore } from "./audit.ts";
import { AuditConflictError, sameAuditEvent } from "./audit.ts";
import { rtdbCasPut, tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

// Append-only at this surface with tamper controls: an eventId is written
// exactly once. A write carrying an existing eventId succeeds only when the
// content is identical (a legitimate recovery replay); differing content is
// refused loudly and the existing record is never overwritten. The check is
// an atomic ETag compare-and-put, safe against concurrent writers. Keyed
// writes (rather than push) are what make recovery replays idempotent.
export class RtdbAuditStore implements AuditStore {
  // Create-or-identical-replay write to the primary log. Throws
  // AuditConflictError when the eventId exists with different content.
  private async putPrimary(tenantId: string, event: AuditEvent): Promise<void> {
    const path = `${tenantRoot(tenantId)}/audit/${event.eventId}`;
    const wrote = await rtdbCasPut<AuditEvent>(path, (current) => current === null || sameAuditEvent(current, event), event);
    if (!wrote) throw new AuditConflictError(event.eventId);
  }
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
    await this.putPrimary(event.tenantId, event);
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
        await this.putPrimary(tenantId, entry.event);
        await database.ref(`${base}/${key}`).remove();
        recovered += 1;
      } catch (error) {
        // Stays on the fallback path for the next sweep. A conflict means the
        // primary log holds DIFFERENT content under this eventId: possible
        // tampering; the fallback record is preserved as evidence and the
        // refusal is loud.
        console.error("audit recovery replay refused", {
          eventId: entry.event.eventId,
          conflict: error instanceof AuditConflictError,
          cause: error instanceof Error ? error.message : "unknown",
        });
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
