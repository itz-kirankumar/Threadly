import { test } from "node:test";
import assert from "node:assert/strict";

const { decideRazorpayBlockedAction, decideDodoBlockedAction } = await import("../src/lib/billing/recovery.ts");

const baseAttempt = {
  id: "att_abc",
  provider: "razorpay",
  plan: "pro",
  interval: "monthly",
  state: "uncertain",
  checkoutUrl: null,
  providerRef: null,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
};
const now = new Date();

test("razorpay: open order on the receipt resumes, never duplicates", () => {
  const d = decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [{ id: "order_K9", status: "created" }], readsAgree: true });
  assert.deepEqual(d, { action: "resume", orderId: "order_K9" });
  const d2 = decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [{ id: "order_K9", status: "attempted" }], readsAgree: true });
  assert.deepEqual(d2, { action: "resume", orderId: "order_K9" });
});

test("razorpay: paid order reconciles, no new order", () => {
  const d = decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [{ id: "o1", status: "paid" }], readsAgree: true });
  assert.equal(d.action, "mark_reconciled_paid");
});

test("razorpay: empty listing never unblocks - absence is not proof of no-resource", () => {
  const d = decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [], readsAgree: true });
  assert.equal(d.action, "keep_blocked");
});

test("razorpay: young attempt or disagreeing/failed reads stay blocked", () => {
  const young = { ...baseAttempt, createdAt: new Date(Date.now() - 60 * 1000).toISOString() };
  assert.equal(decideRazorpayBlockedAction({ existing: young, now, orders: [], readsAgree: true }).action, "keep_blocked");
  assert.equal(decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [], readsAgree: false }).action, "keep_blocked");
  assert.equal(decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: null, readsAgree: false }).action, "keep_blocked");
});

test("dodo: payment found reconciles; unknown stays blocked", () => {
  assert.equal(decideDodoBlockedAction({ existing: baseAttempt, now, paymentFound: true }).action, "mark_reconciled_paid");
  assert.equal(decideDodoBlockedAction({ existing: baseAttempt, now, paymentFound: null }).action, "keep_blocked");
});

test("dodo: clean payments lookup never unblocks - terminality unproven", () => {
  const old = { ...baseAttempt, provider: "dodo", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
  assert.equal(decideDodoBlockedAction({ existing: old, now, paymentFound: false }).action, "keep_blocked");
});

test("razorpay: multiple open orders on one receipt is ambiguous - blocked", () => {
  const d = decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [{ id: "o1", status: "created" }, { id: "o2", status: "created" }], readsAgree: true });
  assert.equal(d.action, "keep_blocked");
});

test("freeze: age never unblocks via evaluateAttempt for unresolved states", async () => {
  const { evaluateAttempt } = await import("../src/lib/billing/attempt.ts");
  const ancient = { ...baseAttempt, createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() };
  for (const state of ["pending", "uncertain", "issued"]) {
    const v = evaluateAttempt({ ...ancient, state }, now);
    assert.equal(v.open, false, state);
  }
  for (const state of ["failed", "expired", "reconciled"]) {
    const v = evaluateAttempt({ ...ancient, state }, now);
    assert.equal(v.open, true, state);
  }
});
