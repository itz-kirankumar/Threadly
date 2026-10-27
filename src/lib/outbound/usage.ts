// Usage metering. Every costed action writes a UsageEvent with an idempotency
// key; recording the same key twice is a no-op. costMinorUnits is null until
// the action has a verified provider price — never an estimate. The tenant
// cost total feeds checkDispatch's costCeiling gate.

import type { UsageEvent } from "./types.ts";

export interface UsageStore {
  recordUsage(event: UsageEvent): Promise<"recorded" | "duplicate">;
  listUsage(tenantId: string): Promise<UsageEvent[]>;
  sumCostMinorUnits(tenantId: string): Promise<number>;
}

export class MemoryUsageStore implements UsageStore {
  events = new Map<string, UsageEvent>();

  async recordUsage(event: UsageEvent): Promise<"recorded" | "duplicate"> {
    const key = `${event.tenantId}:${event.idempotencyKey}`;
    if (this.events.has(key)) return "duplicate";
    this.events.set(key, event);
    return "recorded";
  }
  async listUsage(tenantId: string): Promise<UsageEvent[]> {
    return [...this.events.values()].filter((e) => e.tenantId === tenantId);
  }
  async sumCostMinorUnits(tenantId: string): Promise<number> {
    return (await this.listUsage(tenantId)).reduce((sum, e) => sum + (e.costMinorUnits ?? 0), 0);
  }
}
