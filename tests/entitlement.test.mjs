import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTransition } from "../src/lib/billing/entitlement.ts";

const base = {
  provider: "dodo",
  eventId: "evt1",
  eventAt: "2026-10-26T10:00:00.000Z",
  subscriptionId: "sub_1",
  customerId: "cus_1",
  customerEmail: "a@b.c",
  plan: "pro",
  interval: "annual",
  mode: "test",
};
const currentActive = {
  provider: "dodo",
  plan: "pro",
  interval: "annual",
  status: "active",
  subscriptionId: "sub_1",
  customerId: "cus_1",
  customerEmail: "a@b.c",
  mode: "test",
  updatedAt: "2026-10-26T09:00:00.000Z",
};

test("new active subscription upgrades", () => {
  const d = decideTransition(null, { ...base, status: "active" });
  assert.equal(d.action, "upgrade");
  assert.equal(d.plan, "pro");
});

test("cancel of the current subscription downgrades", () => {
  const d = decideTransition(currentActive, { ...base, status: "ended" });
  assert.equal(d.action, "downgrade");
});

test("cancel of a superseded subscription is ignored (stale cancel cannot clobber resubscribe)", () => {
  const d = decideTransition({ ...currentActive, subscriptionId: "sub_2" }, { ...base, status: "ended" });
  assert.equal(d.action, "ignore");
});

test("out-of-order event older than applied state is ignored", () => {
  const d = decideTransition(currentActive, { ...base, status: "ended", eventAt: "2026-10-26T08:00:00.000Z" });
  assert.equal(d.action, "ignore");
});

test("grace keeps current plan and records status", () => {
  const d = decideTransition(currentActive, { ...base, status: "grace", eventAt: "2026-10-26T11:00:00.000Z" });
  assert.equal(d.action, "keep");
  assert.equal(d.plan, "pro");
  assert.equal(d.record.status, "grace");
});

test("grace from no record keeps event plan", () => {
  const d = decideTransition(null, { ...base, status: "grace" });
  assert.equal(d.action, "keep");
  assert.equal(d.plan, "pro");
});

test("different subscription activating switches with cancel note", () => {
  const d = decideTransition(currentActive, { ...base, status: "active", subscriptionId: "sub_9", provider: "razorpay", eventAt: "2026-10-26T12:00:00.000Z" });
  assert.equal(d.action, "upgrade");
  assert.match(d.note, /cancel the old one/);
  assert.equal(d.record.provider, "razorpay");
});

test("unknown status ignored", () => {
  const d = decideTransition(currentActive, { ...base, status: "unknown" });
  assert.equal(d.action, "ignore");
});

import { evaluateAttempt } from "../src/lib/billing/attempt.ts";

const attemptBase = {
  id: "att1",
  provider: "dodo",
  plan: "pro",
  interval: "annual",
  checkoutUrl: "https://checkout.example/x",
  providerRef: "cks_1",
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
};
const NOW = new Date("2026-10-26T10:30:00.000Z");

test("no existing attempt opens", () => {
  assert.equal(evaluateAttempt(null, NOW).open, true);
});
test("failed/expired/reconciled attempts open", () => {
  for (const state of ["failed", "expired", "reconciled"]) {
    assert.equal(evaluateAttempt({ ...attemptBase, state }, NOW).open, true, state);
  }
});
test("issued attempt within validity blocks and returns its url", () => {
  const v = evaluateAttempt({ ...attemptBase, state: "issued" }, NOW);
  assert.equal(v.open, false);
  assert.equal(v.checkoutUrl, "https://checkout.example/x");
});
test("uncertain attempt within validity blocks without failover", () => {
  const v = evaluateAttempt({ ...attemptBase, state: "uncertain" }, NOW);
  assert.equal(v.open, false);
});
test("pending attempt within validity blocks", () => {
  const v = evaluateAttempt({ ...attemptBase, state: "pending" }, NOW);
  assert.equal(v.open, false);
});
test("attempt older than 24h opens again", () => {
  const later = new Date("2026-10-27T11:00:00.000Z");
  assert.equal(evaluateAttempt({ ...attemptBase, state: "uncertain" }, later).open, true);
});

// --- Razorpay Standard Checkout (one-time orders) ---
test("razorpay signature verification (HMAC-SHA256 order_id|payment_id)", async () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_x";
  process.env.RAZORPAY_KEY_SECRET = "testsecret";
  const { verifyPaymentSignature } = await import("../src/lib/billing/razorpay.ts");
  const { createHmac } = await import("node:crypto");
  const good = createHmac("sha256", "testsecret").update("order_123|pay_456").digest("hex");
  assert.equal(verifyPaymentSignature("order_123", "pay_456", good), true);
  assert.equal(verifyPaymentSignature("order_123", "pay_456", "deadbeef"), false);
  assert.equal(verifyPaymentSignature("order_123", "pay_999", good), false);
});

test("razorpay period end for fixed-term one-time purchases", async () => {
  const { periodEndFor } = await import("../src/lib/billing/razorpay.ts");
  const base = new Date("2026-10-26T00:00:00Z");
  const monthly = Date.parse(periodEndFor("monthly", base));
  const annual = Date.parse(periodEndFor("annual", base));
  assert.ok(monthly > base.getTime() + 27 * 86400000 && monthly < base.getTime() + 32 * 86400000);
  assert.ok(annual > base.getTime() + 364 * 86400000 && annual < base.getTime() + 367 * 86400000);
});

test("razorpay server-authoritative order pricing (client cannot underprice)", async () => {
  const { ORDER_PRICES } = await import("../src/lib/billing/razorpay.ts");
  assert.equal(ORDER_PRICES.pro.monthly.amount, 4900);
  assert.equal(ORDER_PRICES.pro.annual.amount, 46800);
  assert.equal(ORDER_PRICES.growth.monthly.currency, "USD");
  assert.equal(ORDER_PRICES.growth.annual.currency, "USD");
});
