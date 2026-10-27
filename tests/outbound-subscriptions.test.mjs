import { test } from "node:test";
import assert from "node:assert/strict";

const { MemorySubscriptionStore, SubscriptionConflictError, renewalState } = await import("../src/lib/outbound/subscriptions.ts");
const { secretMatches, parseGraphNotifications } = await import("../src/lib/outbound/webhooks.ts");

const NOW = new Date("2026-10-28T00:00:00Z");

function sub(over = {}) {
  return {
    tenantId: "t1", senderId: "snd_1", provider: "microsoft", subscriptionId: "sub_1",
    resource: "users/u1/messages", expiresAt: "2026-11-04T00:00:00Z",
    createdAt: NOW.toISOString(), createdBy: "admin1", renewedAt: null, ...over,
  };
}

test("register is create-or-identical; conflicting binding throws and never rebinds", async () => {
  const store = new MemorySubscriptionStore();
  const first = await store.register(sub());
  assert.equal(first.created, true);
  const again = await store.register(sub());
  assert.equal(again.created, false);
  // same id, different tenant -> conflict, original binding intact
  await assert.rejects(() => store.register(sub({ tenantId: "t2" })), SubscriptionConflictError);
  // same id, different sender -> conflict
  await assert.rejects(() => store.register(sub({ senderId: "snd_2" })), SubscriptionConflictError);
  const bound = await store.getBySubscriptionId("microsoft", "sub_1");
  assert.equal(bound.tenantId, "t1");
  assert.equal(bound.senderId, "snd_1");
  // provider namespaces are distinct
  const gmail = await store.register(sub({ provider: "gmail" }));
  assert.equal(gmail.created, true);
});

test("listForTenant is tenant-scoped; markRenewed updates expiry", async () => {
  const store = new MemorySubscriptionStore();
  await store.register(sub());
  await store.register(sub({ tenantId: "t2", subscriptionId: "sub_2" }));
  const mine = await store.listForTenant("t1");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].subscriptionId, "sub_1");
  await store.markRenewed("microsoft", "sub_1", "2026-11-11T00:00:00Z", NOW.toISOString());
  const renewed = await store.getBySubscriptionId("microsoft", "sub_1");
  assert.equal(renewed.expiresAt, "2026-11-11T00:00:00Z");
  assert.equal(renewed.renewedAt, NOW.toISOString());
  await assert.rejects(() => store.markRenewed("microsoft", "sub_missing", "2026-11-11T00:00:00Z", NOW.toISOString()));
});

test("renewalState: ok -> renew_due -> expired", () => {
  assert.equal(renewalState(sub({ expiresAt: "2026-11-04T00:00:00Z" }), NOW), "ok");
  assert.equal(renewalState(sub({ expiresAt: "2026-10-28T12:00:00Z" }), NOW), "renew_due");
  assert.equal(renewalState(sub({ expiresAt: "2026-10-27T23:59:59Z" }), NOW), "expired");
  assert.equal(renewalState(sub({ expiresAt: "2026-10-28T00:00:00Z" }), NOW), "expired");
});

test("graph entries carry subscriptionId for binding; clientState stays fail-closed", () => {
  const body = { value: [
    { subscriptionId: "sub_1", clientState: "sec", resource: "users/u1/messages/m1" },
    { clientState: "sec", resource: "users/u1/messages/m2" },
  ]};
  const entries = parseGraphNotifications(body, "sec");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].subscriptionId, "sub_1");
  assert.equal(entries[1].subscriptionId, null);
  assert.equal(parseGraphNotifications({ value: [{ ...body.value[0], clientState: "no" }] }, "sec"), null);
  assert.equal(secretMatches("x", "x"), true);
});
