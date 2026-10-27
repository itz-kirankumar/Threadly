import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");

const ev = (tenantId, key, cost) => ({
  tenantId, usageId: `u_${key}`, kind: "generation", units: 1,
  idempotencyKey: key, costMinorUnits: cost, currency: cost === null ? null : "USD",
  createdAt: "2026-10-27T00:00:00Z", createdBy: "t",
});

test("idempotent recording: same key never double-counts", async () => {
  const s = new MemoryUsageStore();
  assert.equal(await s.recordUsage(ev("t1", "k1", 100)), "recorded");
  assert.equal(await s.recordUsage(ev("t1", "k1", 100)), "duplicate");
  assert.equal(await s.sumCostMinorUnits("t1"), 100);
});

test("unpriced events contribute zero and stay visible", async () => {
  const s = new MemoryUsageStore();
  await s.recordUsage(ev("t1", "k2", null));
  await s.recordUsage(ev("t1", "k3", 50));
  assert.equal(await s.sumCostMinorUnits("t1"), 50);
  assert.equal((await s.listUsage("t1")).filter((e) => e.costMinorUnits === null).length, 1);
});

test("cross-tenant isolation", async () => {
  const s = new MemoryUsageStore();
  await s.recordUsage(ev("t1", "k4", 70));
  assert.equal(await s.sumCostMinorUnits("t2"), 0);
  assert.equal((await s.listUsage("t2")).length, 0);
});
