import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryLedgerStore, intentUniqueKey } = await import("../src/lib/outbound/ledger.ts");

const intent = (tenantId, intentId) => ({
  tenantId, intentId,
  uniqueKey: intentUniqueKey({ tenantId, enrollmentId: "e1", campaignVersion: 1, step: 1 }),
  enrollmentId: "e1", campaignId: "c1", campaignVersion: 1, contactId: "k1", senderId: "s1", step: 1,
  status: "drafted", statusUpdatedAt: new Date().toISOString(),
  cancelReason: null, leaseOwner: null, leaseExpiresAt: null, reconciledAt: null,
  createdAt: new Date().toISOString(), createdBy: "u1",
});

test("cross-tenant reads return null even with a known intent id", async () => {
  const store = new MemoryLedgerStore();
  await store.createIntentIfAbsent(intent("tenantA", "mi_1"));
  assert.equal(await store.getIntent("tenantB", "mi_1"), null);
  assert.notEqual(await store.getIntent("tenantA", "mi_1"), null);
});

test("cross-tenant compareAndSet fails", async () => {
  const store = new MemoryLedgerStore();
  const mine = intent("tenantA", "mi_2");
  await store.createIntentIfAbsent(mine);
  const hijack = { ...mine, status: "approved" };
  assert.equal(await store.compareAndSetStatus("tenantB", "mi_2", "drafted", hijack), false);
  assert.equal((await store.getIntent("tenantA", "mi_2")).status, "drafted");
});

test("unique keys collide only within the same tenant", async () => {
  const store = new MemoryLedgerStore();
  assert.equal(await store.createIntentIfAbsent(intent("tenantA", "mi_3")), "created");
  assert.equal(await store.createIntentIfAbsent(intent("tenantA", "mi_4")), "duplicate"); // same key
  assert.equal(await store.createIntentIfAbsent(intent("tenantB", "mi_4")), "created"); // other tenant: distinct key
});

test("campaign store: cross-tenant suppression and version reads return null", async () => {
  const { MemoryCampaignStore } = await import("../src/lib/outbound/campaign.ts");
  const store = new MemoryCampaignStore();
  const now = new Date().toISOString();
  await store.saveSuppression({
    tenantId: "tenantA", emailToken: "tok1", reason: "opt_out",
    createdAt: now, createdBy: "u1",
  });
  await store.saveCampaignVersion({
    tenantId: "tenantA", campaignId: "c1", version: 1, reviewMode: "review",
    name: "C", steps: [], status: "draft", createdAt: now, createdBy: "u1",
  });
  assert.equal(await store.findSuppression("tenantB", "tok1"), null);
  assert.equal((await store.listSuppressions("tenantB")).length, 0);
  assert.equal(await store.getCampaignVersion("tenantB", "c1", 1), null);
  assert.equal(await store.latestCampaignVersion("tenantB", "c1"), null);
  assert.notEqual(await store.getCampaignVersion("tenantA", "c1", 1), null);
});

test("rtdb path helper rejects unsafe tenant ids", async () => {
  const { tenantRoot } = await import("../src/lib/outbound/rtdb-store.ts");
  assert.throws(() => tenantRoot("bad/tenant"));
  assert.throws(() => tenantRoot("a.b"));
  assert.throws(() => tenantRoot(""));
  assert.equal(tenantRoot("ws_abc-123"), "outbound/ws_abc-123");
});
