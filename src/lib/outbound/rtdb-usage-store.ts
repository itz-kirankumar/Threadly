// RTDB-backed UsageStore. Idempotency key is the storage key, so a retried
// write of the same event is a set onto the same path (no duplicates).

import type { UsageEvent } from "./types.ts";
import type { UsageStore } from "./usage.ts";
import { tenantRoot } from "./rtdb-store.ts";
import { createHash } from "node:crypto";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function keyHash(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 40);
}

// RTDB drops null fields; an unpriced event MUST read costMinorUnits as
// explicit null so the dispatch cost gate fails closed on unknown cost.
export function normalizeUsageEvent(e: UsageEvent): UsageEvent {
  return { ...e, costMinorUnits: e.costMinorUnits ?? null, currency: e.currency ?? null };
}

export class RtdbUsageStore implements UsageStore {
  async recordUsage(event: UsageEvent): Promise<"recorded" | "duplicate"> {
    const database = await db();
    const ref = database.ref(`${tenantRoot(event.tenantId)}/usage/${keyHash(event.idempotencyKey)}`);
    const tx = await ref.transaction((current: UsageEvent | null) => {
      if (current) return; // abort: key already recorded
      return event;
    });
    return tx.committed ? "recorded" : "duplicate";
  }

  async listUsage(tenantId: string): Promise<UsageEvent[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/usage`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, UsageEvent>)
      .filter((e) => e.tenantId === tenantId)
      .map(normalizeUsageEvent);
  }

  async sumCostMinorUnits(tenantId: string): Promise<number> {
    return (await this.listUsage(tenantId)).reduce((sum, e) => sum + (e.costMinorUnits ?? 0), 0);
  }
}
