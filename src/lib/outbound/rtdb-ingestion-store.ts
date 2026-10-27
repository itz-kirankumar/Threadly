import type { InboundEvent, IngestionStore, SyncCursor } from "./ingestion.ts";
import { intentKeyHash, tenantRoot } from "./rtdb-store.ts";

// Event keys carry provider characters (e.g. "gmail:msg1:reply") that RTDB
// paths reject, so events are addressed by hash like intent unique keys.
// Sender ids are already path-safe UUIDs.
function safeKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("invalid key");
  return id;
}

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

// Event keys live at ingestion/events/<safeKey(eventKey)> for O(1) dedup
// lookups; the full event record is written once and never mutated (replay
// deliveries hit hasEvent and stop). Cursors are per sender.
export class RtdbIngestionStore implements IngestionStore {
  async hasEvent(tenantId: string, eventKey: string): Promise<boolean> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/ingestion/events/${intentKeyHash(eventKey)}`).get();
    return snap.exists();
  }

  async saveEvent(e: InboundEvent & { receivedAt: string }): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(e.tenantId)}/ingestion/events/${intentKeyHash(e.eventKey)}`).set(e);
  }

  async getCursor(tenantId: string, senderId: string): Promise<SyncCursor | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/ingestion/cursors/${safeKey(senderId)}`).get();
    return snap.exists() ? (snap.val() as SyncCursor) : null;
  }

  // A webhook-recorded request to pull fresh inbound state. Deliberately
  // NOT the sync cursor: only a real completed pull advances the cursor,
  // otherwise a webhook burst would fake freshness and defeat the
  // stale-sync dispatch pause.
  async markSyncRequested(tenantId: string, senderId: string, marker: string): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(tenantId)}/ingestion/pendingSync/${safeKey(senderId)}`).set({ marker, requestedAt: new Date().toISOString() });
  }

  async saveCursor(c: SyncCursor): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(c.tenantId)}/ingestion/cursors/${safeKey(c.senderId)}`).set(c);
  }
}
