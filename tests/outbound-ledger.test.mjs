import { test } from "node:test";
import assert from "node:assert/strict";

const {
  intentUniqueKey,
  transition,
  canCancel,
  canTransition,
  resolveReconciliation,
  MemoryLedgerStore,
  TransitionError,
} = await import("../src/lib/outbound/ledger.ts");

const NOW = new Date("2026-10-27T12:00:00.000Z");
const ctx = (extra = {}) => ({ now: NOW, actor: "worker-1", ...extra });

function baseIntent(status = "drafted") {
  return {
    tenantId: "t1", intentId: "i1",
    uniqueKey: intentUniqueKey({ tenantId: "t1", enrollmentId: "e1", campaignVersion: 1, step: 1 }),
    enrollmentId: "e1", campaignId: "camp1", campaignVersion: 1,
    contactId: "c1", senderId: "snd1", step: 1,
    status, statusUpdatedAt: NOW.toISOString(), cancelReason: null,
    leaseOwner: null, leaseExpiresAt: null, reconciledAt: null,
    createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

test("unique key is deterministic and step/version scoped", () => {
  const a = intentUniqueKey({ tenantId: "t1", enrollmentId: "e1", campaignVersion: 1, step: 1 });
  assert.equal(a, "t1:e1:v1:s1");
  assert.notEqual(a, intentUniqueKey({ tenantId: "t1", enrollmentId: "e1", campaignVersion: 1, step: 2 }));
  assert.notEqual(a, intentUniqueKey({ tenantId: "t1", enrollmentId: "e1", campaignVersion: 2, step: 1 }));
  assert.notEqual(a, intentUniqueKey({ tenantId: "t2", enrollmentId: "e1", campaignVersion: 1, step: 1 }));
});

test("happy path: drafted through provider_accepted", () => {
  let i = baseIntent("drafted");
  i = transition(i, "approved", ctx());
  i = transition(i, "scheduled", ctx());
  i = transition(i, "reserved", ctx());
  assert.equal(i.leaseOwner, "worker-1");
  assert.ok(i.leaseExpiresAt > NOW.toISOString());
  i = transition(i, "dispatching", ctx());
  assert.equal(i.leaseOwner, null);
  i = transition(i, "provider_accepted", ctx());
  assert.equal(i.status, "provider_accepted");
  i = transition(i, "delivered_if_reported", ctx());
  assert.equal(i.status, "delivered_if_reported");
});

test("illegal transitions throw", () => {
  assert.throws(() => transition(baseIntent("drafted"), "dispatching", ctx()), TransitionError);
  assert.throws(() => transition(baseIntent("provider_accepted"), "cancelled", ctx()), TransitionError);
  assert.throws(() => transition(baseIntent("provider_rejected"), "reserved", ctx()), TransitionError);
  assert.throws(() => transition(baseIntent("cancelled"), "scheduled", ctx()), TransitionError);
});

test("unknown outcome cannot be requeued without reconciliation proof", () => {
  const i = baseIntent("provider_unknown");
  assert.throws(() => transition(i, "reserved", ctx()), TransitionError);
  const ok = transition(i, "reserved", ctx({ reconciled: true }));
  assert.equal(ok.status, "reserved");
});

test("reconciliation resolves unknown to accepted or rejected", () => {
  const i = baseIntent("provider_unknown");
  const accepted = resolveReconciliation(i, { kind: "accepted", providerCorrelationId: "p1" }, ctx());
  assert.equal(accepted.status, "provider_accepted");
  assert.ok(accepted.reconciledAt);
  const rejected = resolveReconciliation(i, { kind: "rejected", detail: "550" }, ctx());
  assert.equal(rejected.status, "provider_rejected");
  const still = resolveReconciliation(i, { kind: "still_unknown" }, ctx());
  assert.equal(still.status, "provider_unknown");
  assert.throws(() => resolveReconciliation(baseIntent("scheduled"), { kind: "accepted", providerCorrelationId: "p" }, ctx()), TransitionError);
});

test("cancellation only before provider submission", () => {
  for (const s of ["drafted", "approved", "scheduled", "reserved", "provider_unknown"]) {
    assert.equal(canCancel(s), true, s);
    const c = transition(baseIntent(s), "cancelled", ctx({ reason: "opt_out" }));
    assert.equal(c.status, "cancelled");
    assert.equal(c.cancelReason, "opt_out");
  }
  for (const s of ["dispatching", "provider_accepted", "provider_rejected", "bounced"]) {
    assert.equal(canCancel(s), false, s);
  }
});

test("bounce and delivery evidence only after acceptance", () => {
  assert.equal(canTransition("provider_accepted", "bounced"), true);
  assert.equal(canTransition("dispatching", "bounced"), false);
});

test("store: create is idempotent on uniqueKey, CAS guards races", async () => {
  const store = new MemoryLedgerStore();
  const i = baseIntent("approved");
  assert.equal(await store.createIntentIfAbsent(i), "created");
  assert.equal(await store.createIntentIfAbsent(i), "duplicate");

  const scheduled = transition(i, "scheduled", ctx());
  assert.equal(await store.compareAndSetStatus("t1", "i1", "approved", scheduled), true);
  // a second worker losing the race cannot move it again
  assert.equal(await store.compareAndSetStatus("t1", "i1", "approved", scheduled), false);

  // tenant scoping: other tenant cannot read or CAS
  assert.equal(await store.getIntent("t2", "i1"), null);
  assert.equal(await store.compareAndSetStatus("t2", "i1", "scheduled", scheduled), false);

  const found = await store.findIntentByUniqueKey(i.uniqueKey);
  assert.equal(found.status, "scheduled");
});

test("store: attempts are append-only evidence per intent", async () => {
  const store = new MemoryLedgerStore();
  await store.createIntentIfAbsent(baseIntent("dispatching"));
  await store.appendAttempt({
    tenantId: "t1", attemptId: "att1", intentId: "i1", dispatchedAt: NOW.toISOString(),
    provider: "gmail", providerCorrelationId: null, outcome: "unknown",
    providerStatusCode: null, detail: "timeout after submit",
    createdAt: NOW.toISOString(), createdBy: "worker-1",
  });
  const list = await store.listAttempts("t1", "i1");
  assert.equal(list.length, 1);
  assert.equal(list[0].outcome, "unknown");
});
