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

test("razorpay: empty listing with agreeing reads and old attempt allows new", () => {
  const d = decideRazorpayBlockedAction({ existing: baseAttempt, now, orders: [], readsAgree: true });
  assert.equal(d.action, "mark_failed_allow_new");
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

test("dodo: fresh session only after TTL with clean payments lookup", () => {
  const old = { ...baseAttempt, provider: "dodo", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
  assert.equal(decideDodoBlockedAction({ existing: old, now, paymentFound: false }).action, "allow_new");
  const recent = { ...baseAttempt, provider: "dodo", createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
  assert.equal(decideDodoBlockedAction({ existing: recent, now, paymentFound: false }).action, "keep_blocked");
});
