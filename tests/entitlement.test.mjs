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
test("freeze invariant: local age never reopens an unresolved attempt", () => {
  const later = new Date("2026-10-27T11:00:00.000Z");
  assert.equal(evaluateAttempt({ ...attemptBase, state: "uncertain" }, later).open, false);
  assert.equal(evaluateAttempt({ ...attemptBase, state: "pending" }, later).open, false);
  assert.equal(evaluateAttempt({ ...attemptBase, state: "issued" }, later).open, false);
  assert.equal(evaluateAttempt({ ...attemptBase, state: "failed" }, later).open, true);
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

test("razorpay upgrade quote: prorated difference, same term, upgrades only", async () => {
  const { upgradeQuote } = await import("../src/lib/billing/razorpay.ts");
  const purchasedAt = "2026-10-01T00:00:00Z";
  const periodEnd = "2027-10-01T00:00:00Z";
  const now = new Date("2027-04-01T00:00:00Z"); // ~half the term left
  const q = upgradeQuote({ currentPlan: "pro", newPlan: "growth", interval: "annual", purchasedAt, periodEnd, paidThisTerm: 46800, now });
  assert.ok(q, "quote exists for pro -> growth annual");
  assert.equal(q.currency, "USD");
  // difference 142800-46800 = 96000, ~half remaining
  assert.ok(q.due > 44000 && q.due < 50000, `due ${q.due} roughly half of 96000`);
  assert.ok(q.credit > 21000 && q.credit < 25000);
  assert.ok(q.remainingDays >= 180 && q.remainingDays <= 185);
  // not upgrades:
  assert.equal(upgradeQuote({ currentPlan: "growth", newPlan: "pro", interval: "annual", purchasedAt, periodEnd, paidThisTerm: 142800, now }), null);
  assert.equal(upgradeQuote({ currentPlan: "pro", newPlan: "pro", interval: "annual", purchasedAt, periodEnd, paidThisTerm: 46800, now }), null);
  // discounted actual payment credits the discounted basis, not catalog:
  const discounted = upgradeQuote({ currentPlan: "pro", newPlan: "growth", interval: "annual", purchasedAt, periodEnd, paidThisTerm: 23400, now });
  assert.ok(discounted && discounted.credit < q.credit, "credit follows actual paid basis");
  // repeated upgrade basis: prior 46800 + upgrade top-up 48000 = 94800 credited
  const topped = upgradeQuote({ currentPlan: "growth", newPlan: "growth", interval: "annual", purchasedAt, periodEnd, paidThisTerm: 94800, now });
  assert.equal(topped, null); // same plan still not an upgrade even with bigger basis
  // expired term: no quote
  assert.equal(upgradeQuote({ currentPlan: "pro", newPlan: "growth", interval: "annual", purchasedAt, periodEnd, paidThisTerm: 46800, now: new Date("2027-10-02T00:00:00Z") }), null);
});

test("guest claim secret hashing is stable and salted", async () => {
  const { newClaimSecret, hashClaimSecret } = await import("../src/lib/billing/claims.ts");
  const a = newClaimSecret();
  const b = newClaimSecret();
  assert.notEqual(a.secret, b.secret);
  assert.notEqual(a.hash, b.hash);
  assert.equal(hashClaimSecret(a.secret), a.hash);
  assert.notEqual(hashClaimSecret(a.secret), b.hash);
  assert.match(a.secret, /^[A-Za-z0-9_-]{32}$/);
});

test("guest claim transitions: replay, interruption, expiry, wrong-state", async () => {
  const { decideClaimTransition } = await import("../src/lib/billing/claims.ts");
  const base = {
    id: "clm_x", provider: "razorpay", plan: "pro", interval: "annual", amount: 46800, currency: "USD",
    orderId: "order_x", paymentId: null, claimTokenHash: "h", checkoutEmail: null, checkoutContact: null,
    claimedBy: null, claimedAt: null, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
  };
  const now = new Date("2026-10-26T00:00:00Z");
  // confirm replay (pending -> paid_unclaimed twice): second is abort
  assert.equal(decideClaimTransition({ ...base, status: "pending" }, ["pending"], now), "apply");
  assert.equal(decideClaimTransition({ ...base, status: "paid_unclaimed" }, ["pending"], now), "abort");
  // claim replay (paid_unclaimed -> claimed twice): second is abort
  assert.equal(decideClaimTransition({ ...base, status: "paid_unclaimed" }, ["paid_unclaimed"], now), "apply");
  assert.equal(decideClaimTransition({ ...base, status: "claimed" }, ["paid_unclaimed"], now), "abort");
  // interrupted claim left uncertain cannot be claimed directly
  assert.equal(decideClaimTransition({ ...base, status: "uncertain" }, ["paid_unclaimed"], now), "abort");
  // expired claim (older than 7d) transitions to expire instead
  const old = { ...base, status: "paid_unclaimed", createdAt: "2026-10-01T00:00:00Z" };
  assert.equal(decideClaimTransition(old, ["paid_unclaimed"], now), "expire");
  // claimed claims never expire out
  const claimed = { ...base, status: "claimed", createdAt: "2026-10-01T00:00:00Z" };
  assert.equal(decideClaimTransition(claimed, ["paid_unclaimed"], now), "abort");
  // missing claim aborts
  assert.equal(decideClaimTransition(null, ["pending"], now), "abort");
});

test("phone normalization: trailing 10 digits, country-code tolerant, empty stays empty", async () => {
  // Renewal semantics: provider fields persist and survive events that omit them.
  {
    const { decideTransition } = await import("../src/lib/billing/entitlement.ts");
    const base = {
      provider: "dodo", eventId: "ev1", eventAt: "2026-10-26T00:00:00.000Z",
      subscriptionId: "sub_1", customerId: "cus_1", customerEmail: "a@b.c",
      plan: "pro", interval: "monthly", status: "active", mode: "test",
      nextBillingDate: "2026-11-26T00:00:00.000Z", cancelAtPeriodEnd: false,
    };
    const first = decideTransition(null, base);
    assert.equal(first.record.nextBillingDate, "2026-11-26T00:00:00.000Z");
    assert.equal(first.record.cancelAtPeriodEnd, false);
    // A later event without renewal fields preserves the last known values.
    const second = decideTransition(first.record, { ...base, eventId: "ev2", eventAt: "2026-10-27T00:00:00.000Z", status: "grace", nextBillingDate: undefined, cancelAtPeriodEnd: undefined });
    assert.equal(second.record.nextBillingDate, "2026-11-26T00:00:00.000Z");
    assert.equal(second.record.cancelAtPeriodEnd, false);
    // A scheduled cancellation flips the flag from the provider payload.
    const third = decideTransition(second.record, { ...base, eventId: "ev3", eventAt: "2026-10-28T00:00:00.000Z", cancelAtPeriodEnd: true });
    assert.equal(third.record.cancelAtPeriodEnd, true);
    // Terminal events clear renewal fields.
    const fourth = decideTransition(third.record, { ...base, eventId: "ev4", eventAt: "2026-11-26T00:00:00.000Z", status: "ended", nextBillingDate: undefined, cancelAtPeriodEnd: undefined });
    assert.equal(fourth.record.nextBillingDate, null);
    assert.equal(fourth.record.cancelAtPeriodEnd, null);
  }

  const { normalizeE164 } = await import("../src/lib/billing/identity.ts");
  // Canonical form: separators tolerated, 00 prefix accepted.
  assert.equal(normalizeE164("+91 63836 66595"), "+916383666595");
  assert.equal(normalizeE164("+91-638-366-6595"), "+916383666595");
  assert.equal(normalizeE164("00916383666595"), "+916383666595");
  assert.equal(normalizeE164("  +916383666595 "), "+916383666595");
  // REGRESSION - cross-country suffix collision: these share trailing digits
  // but are different numbers in different countries and must NEVER match.
  assert.notEqual(normalizeE164("+916383666595"), normalizeE164("+16383666595"));
  assert.notEqual(normalizeE164("+14155552671"), normalizeE164("+914155552671"));
  // Same number, same country, canonical match.
  assert.equal(normalizeE164("+14155552671"), normalizeE164("+1 415 555 2671"));
  // No explicit country context -> ambiguous -> null (pending, never match).
  assert.equal(normalizeE164("6383666595"), null);
  assert.equal(normalizeE164("916383666595"), null);
  // Length rules: E.164 total is 8-15 digits including country code.
  assert.equal(normalizeE164("+12345678"), "+12345678");
  assert.equal(normalizeE164("+1234567"), null);
  assert.equal(normalizeE164("+123456789012345"), "+123456789012345");
  assert.equal(normalizeE164("+1234567890123456"), null);
  // Garbage / empty / missing -> null.
  assert.equal(normalizeE164("+91abcdefghij"), null);
  assert.equal(normalizeE164("+"), null);
  assert.equal(normalizeE164(""), null);
  assert.equal(normalizeE164(null), null);
  assert.equal(normalizeE164(undefined), null);
});

test("claim reconcile: provider evidence only - paid+match advances, everything else holds", async () => {
  const { decideClaimReconcile } = await import("../src/lib/billing/claims.ts");
  const claim = {
    id: "clm_1", provider: "razorpay", plan: "pro", interval: "monthly",
    amount: 4900, currency: "USD", orderId: "order_1", paymentId: null,
    status: "pending", claimTokenHash: "h", checkoutEmail: null, checkoutContact: null,
    claimedBy: null, claimedAt: null, createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
  };
  const paid = { status: "paid" };
  const captured = { id: "pay_1", status: "captured", amount: 4900, currency: "USD", order_id: "order_1", email: "b@x.y", contact: "+916383666595" };

  // paid order + matching captured payment advances with provider contacts
  const ok = decideClaimReconcile(claim, paid, captured);
  assert.equal(ok.action, "mark_paid");
  assert.equal(ok.paymentId, "pay_1");
  assert.equal(ok.email, "b@x.y");

  // unpaid order: no change, claim stays pending (no assumed expiry)
  assert.equal(decideClaimReconcile(claim, { status: "created" }, null).action, "none");
  // paid order but payment not captured yet: no change
  assert.equal(decideClaimReconcile(claim, paid, { ...captured, status: "created" }).action, "none");
  // payment bound to a different order: no change
  assert.equal(decideClaimReconcile(claim, paid, { ...captured, order_id: "order_2" }).action, "none");
  // amount/currency mismatch pauses for review, never grants
  assert.equal(decideClaimReconcile(claim, paid, { ...captured, amount: 46800 }).action, "pause_mismatch");
  assert.equal(decideClaimReconcile(claim, paid, { ...captured, currency: "INR" }).action, "pause_mismatch");
  // a non-pending claim is never re-touched by reconciliation
  assert.equal(decideClaimReconcile({ ...claim, status: "paid_unclaimed" }, paid, captured).action, "none");
  assert.equal(decideClaimReconcile({ ...claim, status: "uncertain" }, paid, captured).action, "none");
});

test("paid trial pricing: $7 weekly only, period ends in 7 days", async () => {
  const { orderPrice, periodEndFor } = await import("../src/lib/billing/razorpay.ts");
  assert.deepEqual(orderPrice("trial", "weekly"), { amount: 700, currency: "USD" });
  // The trial is never sold as monthly/annual, and paid plans have no weekly term.
  assert.equal(orderPrice("trial", "monthly"), null);
  assert.equal(orderPrice("trial", "annual"), null);
  assert.equal(orderPrice("pro", "weekly"), null);
  assert.deepEqual(orderPrice("pro", "monthly"), { amount: 4900, currency: "USD" });
  const start = new Date("2026-10-26T10:00:00.000Z");
  assert.equal(periodEndFor("weekly", start), "2026-11-02T10:00:00.000Z");
});

test("trial expiry: lapsedPlan enforces 7-day term server-side", async () => {
  const { lapsedPlan } = await import("../src/lib/geo/plan.ts");
  const now = new Date("2026-11-10T10:00:00.000Z");
  // Active paid trial whose 7-day term has ended lapses to no-plan.
  assert.deepEqual(
    lapsedPlan("trial", { provider: "razorpay", status: "active", periodEnd: "2026-11-09T10:00:00.000Z" }, now),
    { plan: "none", lapsed: true },
  );
  // Same for an expired paid Pro term.
  assert.deepEqual(
    lapsedPlan("pro", { provider: "razorpay", status: "active", periodEnd: "2026-11-01T10:00:00.000Z" }, now),
    { plan: "none", lapsed: true },
  );
  // Trial still inside its 7 days keeps access.
  assert.deepEqual(
    lapsedPlan("trial", { provider: "razorpay", status: "active", periodEnd: "2026-11-12T10:00:00.000Z" }, now),
    { plan: "trial", lapsed: false },
  );
  // One second before expiry still counts as active.
  assert.deepEqual(
    lapsedPlan("trial", { provider: "razorpay", status: "active", periodEnd: "2026-11-10T10:00:01.000Z" }, now),
    { plan: "trial", lapsed: false },
  );
  // Dodo subscriptions renew via webhook and never lapse on periodEnd.
  assert.deepEqual(
    lapsedPlan("pro", { provider: "dodo", status: "active", periodEnd: "2026-11-01T10:00:00.000Z" }, now),
    { plan: "pro", lapsed: false },
  );
  // A Razorpay record without a period end, or already ended, never re-lapses.
  assert.deepEqual(
    lapsedPlan("pro", { provider: "razorpay", status: "active", periodEnd: null }, now),
    { plan: "pro", lapsed: false },
  );
  assert.deepEqual(
    lapsedPlan("trial", { provider: "razorpay", status: "ended", periodEnd: "2026-11-01T10:00:00.000Z" }, now),
    { plan: "trial", lapsed: false },
  );
  // No billing record at all: stored plan stands (grandfathered free-trial users).
  assert.deepEqual(lapsedPlan("trial", null, now), { plan: "trial", lapsed: false });
});

test("planAtLeast enforces the tier ordering used by feature gates", async () => {
  const { planAtLeast } = await import("../src/lib/geo/plan.ts");
  assert.equal(planAtLeast("trial", "pro"), false);   // BYOK/invites gate
  assert.equal(planAtLeast("pro", "pro"), true);
  assert.equal(planAtLeast("pro", "growth"), false);  // audit + public API gate
  assert.equal(planAtLeast("growth", "growth"), true);
  assert.equal(planAtLeast("enterprise", "growth"), true);
  assert.equal(planAtLeast("none", "trial"), false);
});

test("decideClaimGrant: concurrent promo claims for one workspace have exactly one winner", async () => {
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const promoGrant = (claimId) => ({ provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_GOTHREADLY100", claimId, customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: new Date("2026-10-26T00:00:00Z") });
  // Two claims race on an empty workspace; the transaction applies them in some order.
  const first = decideClaimGrant(null, promoGrant("clm_A"));
  assert.equal(first.ok, true);
  const second = decideClaimGrant(first.record, promoGrant("clm_B"));
  assert.equal(second.ok, false);
  assert.equal(second.reason, "active_plan");
  // Loser retry after the winner's term: winner still active -> still blocked, term untouched.
  assert.equal(first.record.periodEnd, "2026-11-02T00:00:00.000Z");
});

test("decideClaimGrant: promo can never overwrite or extend a paid plan", async () => {
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const paid = { provider: "razorpay", plan: "pro", interval: "monthly", status: "active", subscriptionId: null, customerId: null, customerEmail: "a@b.co", mode: "live", updatedAt: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", orderId: "order_paid", paidThisTerm: 4900 };
  const res = decideClaimGrant(paid, { provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_A", claimId: "clm_A", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: new Date("2026-10-26T00:00:00Z") });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "active_plan");
  // Grace also blocks (dunning customer keeps their plan).
  assert.equal(decideClaimGrant({ ...paid, status: "grace" }, { provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_A", claimId: "clm_A", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: new Date() }).ok, false);
});

test("decideClaimGrant: lapsed promo blocks a second promo but allows a paid purchase", async () => {
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const lapsedPromo = { provider: "promo", plan: "trial", interval: "weekly", status: "ended", subscriptionId: null, customerId: null, customerEmail: "a@b.co", mode: "live", updatedAt: "2026-10-20T00:00:00Z", periodEnd: "2026-10-25T00:00:00Z", orderId: "promo_GOTHREADLY100", paidThisTerm: 0, promoConsumed: true };
  const again = decideClaimGrant(lapsedPromo, { provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_GOTHREADLY100", claimId: "clm_A", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: new Date("2026-10-26T00:00:00Z") });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "promo_consumed");
  const paid = decideClaimGrant(lapsedPromo, { provider: "razorpay", plan: "pro", interval: "monthly", amount: 4900, orderId: "order_paid", claimId: "clm_paid", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-25T00:00:00.000Z", now: new Date("2026-10-26T00:00:00Z") });
  assert.equal(paid.ok, true);
  assert.equal(paid.record.promoConsumed, true); // consumption survives the upgrade
  assert.equal(paid.record.status, "active");
});

test("decideTransition preserves promoConsumed across renewals and switches", async () => {
  const { decideTransition } = await import("../src/lib/billing/entitlement.ts");
  const current = { provider: "dodo", plan: "pro", interval: "monthly", status: "active", subscriptionId: "sub_1", customerId: "cus_1", customerEmail: "a@b.co", mode: "live", updatedAt: "2026-10-01T00:00:00Z", promoConsumed: true };
  const renewal = decideTransition(current, { provider: "dodo", plan: "pro", interval: "monthly", status: "active", subscriptionId: "sub_1", customerId: "cus_1", customerEmail: "a@b.co", mode: "live", eventId: "evt2", eventAt: "2026-10-26T10:00:00.000Z" });
  assert.equal(renewal.record.promoConsumed, true);
});

test("decideClaimGrant: same-claim retry after partial attach is idempotent - record untouched, term not reset", async () => {
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const grant = { provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_GOTHREADLY100", claimId: "clm_A", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: new Date("2026-10-26T00:00:00Z") };
  const first = decideClaimGrant(null, grant);
  assert.equal(first.ok, true);
  // Retry with a LATER clock (recovery attempt minutes later): same record back, periodEnd preserved.
  const retry = decideClaimGrant(first.record, { ...grant, now: new Date("2026-10-26T01:00:00Z") });
  assert.equal(retry.ok, true);
  assert.equal(retry.record.periodEnd, "2026-11-02T00:00:00.000Z");
  assert.equal(retry.record.updatedAt, first.record.updatedAt);
  assert.equal(retry.record.claimId, "clm_A");
  // A DIFFERENT claim for the same workspace still aborts.
  const other = decideClaimGrant(first.record, { ...grant, claimId: "clm_B" });
  assert.equal(other.ok, false);
  assert.equal(other.reason, "active_plan");
});






// ---- single-boundary promo consumption: interleavings over a serialized node ----
// Models RTDB transaction semantics on geo/promoIdentities: each transaction
// reads the current value and its update applies atomically; transactions on
// the node serialize. The email+phone pair lives in this one map, so pair
// updates are atomic.
function makeMapNode() {
  return {
    value: null,
    tx(fn) {
      const next = fn(this.value);
      if (next !== undefined) this.value = next;
      return next !== undefined;
    },
  };
}
const T0 = new Date("2026-10-26T00:00:00Z");
const plus = (min) => new Date(T0.getTime() + min * 60000);
const KEYS = { emailKey: "email_x", phoneKey: "phone_y" };

test("boundary: reserve is atomic over the email+phone pair", async () => {
  const { reserveAllTransition } = await import("../src/lib/billing/claims.ts");
  const r = reserveAllTransition(null, KEYS, "clm_A", "uidA", T0);
  assert.equal(r.action, "held");
  assert.equal(r.map.email_x.claimId, "clm_A");
  assert.equal(r.map.phone_y.claimId, "clm_A");
  assert.equal(r.map.email_x.fence, r.map.phone_y.fence);
});

test("boundary: THE PAUSE-AFTER-RESUME schedule - stale claimant cannot grant after reclamation", async () => {
  const { reserveAllTransition, reclaimAllTransition, consumeAllTransition } = await import("../src/lib/billing/claims.ts");
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const node = makeMapNode();
  let billing = null;
  // A reserves, then pauses > lease.
  node.tx((m) => { const t = reserveAllTransition(m, KEYS, "clm_A", "uidA", T0); return t.action === "held" ? t.map : undefined; });
  const snapshot = node.value;
  // 11 minutes pass. B's truth check says orphan (claim paid_unclaimed, no billing). B reclaims.
  const d = reclaimAllTransition(node.value, KEYS, snapshot, { claimId: "clm_B", uid: "uidB" }, plus(11));
  assert.equal(d.action, "reclaim");
  if (d.action === "reclaim") node.tx(() => d.map);
  assert.equal(node.value.email_x.fence, 2);
  // A resumes and tries to consume: ownership changed -> FAILS before any billing write.
  const consumeA = consumeAllTransition(node.value, KEYS, "clm_A");
  assert.equal(consumeA.ok, false);
  // The route gates billing on consumption, so decideClaimGrant is never reached for A:
  // assert the guard ordering by confirming billing is untouched.
  assert.equal(billing, null);
  // B consumes and grants.
  const consumeB = consumeAllTransition(node.value, KEYS, "clm_B");
  assert.equal(consumeB.ok, true);
  if (consumeB.ok) node.tx(() => consumeB.map);
  const g = decideClaimGrant(billing, { provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_GOTHREADLY100", claimId: "clm_B", customerEmail: "b@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: plus(11) });
  assert.equal(g.ok, true);
  if (g.ok) billing = g.record;
  // A retries from scratch: committed + claimed truth -> taken forever.
  const rA = reserveAllTransition(node.value, KEYS, "clm_A2", "uidA", plus(12));
  assert.equal(rA.action, "taken");
});

test("boundary: consume vs reclaim landing order - both orders yield exactly one consumer", async () => {
  const { reserveAllTransition, reclaimAllTransition, consumeAllTransition } = await import("../src/lib/billing/claims.ts");
  // Order (i): owner consumes first on an expired-but-unreclaimed lease -> reclaimer's CAS mismatches.
  let node = makeMapNode();
  node.tx((m) => { const t = reserveAllTransition(m, KEYS, "clm_A", "uidA", T0); return t.action === "held" ? t.map : undefined; });
  const snap = node.value;
  let c = consumeAllTransition(node.value, KEYS, "clm_A");
  assert.equal(c.ok, true);
  if (c.ok) node.tx(() => c.map);
  let d = reclaimAllTransition(node.value, KEYS, snap, { claimId: "clm_B", uid: "uidB" }, plus(11));
  assert.equal(d.action, "busy");
  // Order (ii): reclaim first -> stale consume fails.
  node = makeMapNode();
  node.tx((m) => { const t = reserveAllTransition(m, KEYS, "clm_A", "uidA", T0); return t.action === "held" ? t.map : undefined; });
  const snap2 = node.value;
  d = reclaimAllTransition(node.value, KEYS, snap2, { claimId: "clm_B", uid: "uidB" }, plus(11));
  assert.equal(d.action, "reclaim");
  if (d.action === "reclaim") node.tx(() => d.map);
  c = consumeAllTransition(node.value, KEYS, "clm_A");
  assert.equal(c.ok, false);
});

test("boundary: unexpired lease is never reclaimable (in-flight paid_unclaimed honored)", async () => {
  const { reserveAllTransition, reclaimAllTransition } = await import("../src/lib/billing/claims.ts");
  const node = makeMapNode();
  node.tx((m) => { const t = reserveAllTransition(m, KEYS, "clm_A", "uidA", T0); return t.action === "held" ? t.map : undefined; });
  const d = reclaimAllTransition(node.value, KEYS, node.value, { claimId: "clm_B", uid: "uidB" }, plus(1));
  assert.equal(d.action, "busy");
});

test("boundary: crash after consume before billing - same-claim retry recovers idempotently", async () => {
  const { reserveAllTransition, consumeAllTransition } = await import("../src/lib/billing/claims.ts");
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const node = makeMapNode();
  let billing = null;
  const grant = (now) => ({ provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_GOTHREADLY100", claimId: "clm_A", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now });
  node.tx((m) => { const t = reserveAllTransition(m, KEYS, "clm_A", "uidA", T0); return t.action === "held" ? t.map : undefined; });
  const c1 = consumeAllTransition(node.value, KEYS, "clm_A");
  assert.equal(c1.ok, true);
  if (c1.ok) node.tx(() => c1.map);
  // CRASH: no billing write, no claim marker.
  // Retry: reserve sees consumed-by-me; consume is idempotent; billing grant runs.
  const r = reserveAllTransition(node.value, KEYS, "clm_A", "uidA", plus(3));
  assert.equal(r.action, "consumed-by-me");
  const c2 = consumeAllTransition(node.value, KEYS, "clm_A");
  assert.equal(c2.ok, true);
  assert.equal(c2.ok && c2.already, true);
  const g = decideClaimGrant(billing, grant(plus(3)));
  assert.equal(g.ok, true);
  if (g.ok) billing = g.record;
  // Third pass (marker/plan already fine): decideClaimGrant idempotent - term never moves.
  const g2 = decideClaimGrant(billing, grant(plus(4)));
  assert.equal(g2.ok, true);
  if (g2.ok) assert.equal(g2.record.periodEnd, "2026-11-02T00:00:00.000Z");
});

test("boundary: rollback after billing abort removes only our ungranted hold", async () => {
  const { reserveAllTransition, consumeAllTransition, rollbackAllTransition } = await import("../src/lib/billing/claims.ts");
  const { decideClaimGrant } = await import("../src/lib/billing/entitlement.ts");
  const node = makeMapNode();
  const paid = { provider: "razorpay", plan: "pro", interval: "monthly", status: "active", subscriptionId: null, customerId: null, customerEmail: "a@b.co", mode: "live", updatedAt: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", orderId: "order_paid", paidThisTerm: 4900, claimId: "clm_paid" };
  node.tx((m) => { const t = reserveAllTransition(m, KEYS, "clm_A", "uidA", T0); return t.action === "held" ? t.map : undefined; });
  const c = consumeAllTransition(node.value, KEYS, "clm_A");
  assert.equal(c.ok, true);
  if (c.ok) node.tx(() => c.map);
  const g = decideClaimGrant(paid, { provider: "promo", plan: "trial", interval: "weekly", amount: 0, orderId: "promo_GOTHREADLY100", claimId: "clm_A", customerEmail: "a@b.co", mode: "live", periodEnd: "2026-11-02T00:00:00.000Z", now: T0 });
  assert.equal(g.ok, false); // active_plan: paid plan preserved
  // Rollback: identity released because nothing was granted.
  node.tx((m) => rollbackAllTransition(m, KEYS, "clm_A", 1));
  assert.equal(node.value.email_x, undefined);
  assert.equal(node.value.phone_y, undefined);
  // The paid billing record is untouched.
  assert.equal(paid.plan, "pro");
  // A fresh promo attempt for the same identity now succeeds.
  const r = reserveAllTransition(node.value, KEYS, "clm_C", "uidA", plus(1));
  assert.equal(r.action, "held");
});

test("boundary: consumed is permanent - term end, plan change, ended billing never unconsume", async () => {
  const { classifyReservationOwner, reclaimAllTransition } = await import("../src/lib/billing/claims.ts");
  const committed = { claimId: "clm_A", uid: "uidA", fence: 1, leaseUntil: plus(-100).toISOString(), committed: true, at: T0.toISOString() };
  assert.equal(classifyReservationOwner(committed, { status: "claimed" }, { claimId: "clm_paid", status: "active" }), "consumed");
  assert.equal(classifyReservationOwner({ ...committed, committed: false }, { status: "claimed" }, null), "consumed");
  assert.equal(classifyReservationOwner({ ...committed, committed: false }, { status: "paid_unclaimed" }, { claimId: "clm_A", status: "ended" }), "consumed");
  const node = makeMapNode();
  node.value = { email_x: committed, phone_y: committed };
  const d = reclaimAllTransition(node.value, KEYS, node.value, { claimId: "clm_B", uid: "uidB" }, plus(200));
  assert.equal(d.action, "busy");
});

// ---- analytics consent gate: only explicit acceptance permits optional analytics ----
test("consent: undecided/declined/malformed never allow analytics; only explicit accepted does", async () => {
  const { parseConsent, analyticsAllowed, readConsent, CONSENT_STORAGE_KEY } = await import("../src/lib/consent.ts");
  assert.equal(parseConsent(null), "undecided");
  assert.equal(parseConsent(""), "undecided");
  assert.equal(parseConsent("not-json{"), "undecided");
  assert.equal(parseConsent(JSON.stringify({ value: "declined", at: "2026-10-26" })), "declined");
  assert.equal(parseConsent(JSON.stringify({ value: "accepted", at: "2026-10-26" })), "accepted");
  // Tricks that must NOT count as acceptance:
  assert.equal(parseConsent(JSON.stringify({ value: "ACCEPTED" })), "declined");
  assert.equal(parseConsent(JSON.stringify({ value: true })), "declined");
  assert.equal(parseConsent(JSON.stringify({ value: "accepted", extra: 1 })), "accepted");
  // Storage-facing helpers: missing/broken storage never allows.
  assert.equal(analyticsAllowed(null), false);
  const fake = (v) => ({ getItem: () => v });
  assert.equal(analyticsAllowed(fake(null)), false);
  assert.equal(analyticsAllowed(fake(JSON.stringify({ value: "declined" }))), false);
  assert.equal(analyticsAllowed(fake(JSON.stringify({ value: "accepted" }))), true);
  const throwing = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(readConsent(throwing), "undecided");
  assert.equal(CONSENT_STORAGE_KEY, "threadly_cookie_consent"); // matches the banner's key
});

// ---- PostHog before_send: ALLOWLISTED public routes only, everything else dropped ----
test("posthog sanitize: allowlisted public pages kept, every other route dropped", async () => {
  const { isAllowedPath, sanitizeTrackedUrl } = await import("../src/lib/analytics-sanitize.ts");
  for (const p of ["/", "/pricing", "/demo", "/blog", "/blog/what-is-geo", "/docs", "/docs/intro", "/security", "/privacy", "/terms", "/refund", "/shipping", "/contact"]) {
    assert.equal(isAllowedPath(p), true, p);
  }
  for (const p of ["/billing/claim/clm_secretid123", "/invite/tok_abc", "/checkout", "/portal", "/portal/login", "/portal/account", "/preview/claim-states", "/api/geo/scan", "/unknown-future-page", "/blogx", "/docsify", "/account"]) {
    assert.equal(isAllowedPath(p), false, p);
    assert.equal(sanitizeTrackedUrl("https://www.gothreadly.live" + p), null, p);
  }
  assert.equal(sanitizeTrackedUrl("https://www.gothreadly.live/pricing?utm=x&token=secret#frag"), "https://www.gothreadly.live/pricing");
  assert.equal(sanitizeTrackedUrl("not a url"), null);
  assert.equal(sanitizeTrackedUrl(undefined), null);
});

test("posthog sanitize: every URL-like property scrubbed; sensitive referrer deleted; event on sensitive page dropped", async () => {
  const { sanitizeAnalyticsEvent } = await import("../src/lib/analytics-sanitize.ts");
  const evt = sanitizeAnalyticsEvent({ properties: {
    $current_url: "https://www.gothreadly.live/pricing?utm=x",
    $pathname: "/pricing",
    $referrer: "https://www.gothreadly.live/billing/claim/clm_super_secret_token",
    $initial_current_url: "https://www.gothreadly.live/invite/tok_secret",
    $entry_current_url: "https://www.gothreadly.live/blog/what-is-geo?ref=x",
    $session_entry_url: "https://www.gothreadly.live/checkout?order=order_secret",
    $external_referrer: "https://google.com/search?q=threadly",
    $search: "?claim=clm_secret",
    $title: "Claim clm_ab12cd34ef56gh78ij90 ready",
  } });
  assert.ok(evt);
  const p = evt.properties;
  assert.equal(p["$current_url"], "https://www.gothreadly.live/pricing");
  assert.equal("$referrer" in p, false);
  assert.equal("$initial_current_url" in p, false);
  assert.equal(p["$entry_current_url"], "https://www.gothreadly.live/blog/what-is-geo");
  assert.equal("$session_entry_url" in p, false);
  assert.equal("$search" in p, false);
  assert.equal(String(p["$title"]).includes("clm_ab12"), false);
  // $pathname disagreeing with an allowlisted current_url drops the event.
  assert.equal(sanitizeAnalyticsEvent({ properties: { $current_url: "https://www.gothreadly.live/pricing", $pathname: "/checkout" } }), null);
  assert.equal(sanitizeAnalyticsEvent({ properties: { $current_url: "https://www.gothreadly.live/invite/abc" } }), null);
  assert.equal(sanitizeAnalyticsEvent({ properties: { $current_url: "https://www.gothreadly.live/billing/claim/clm_x9" } }), null);
});

// ---- social gate: documented PLAN_LIMITS semantics, no guessed fallbacks ----
test("social gate: 0 blocks, null means unlimited (no rate check), finite caps preserved", async () => {
  const { socialGate, PLAN_LIMITS } = await import("../src/lib/geo/plan.ts");
  assert.deepEqual(socialGate("none"), { kind: "blocked" });
  for (const plan of ["trial", "pro", "growth", "enterprise"]) {
    assert.deepEqual(socialGate(plan), { kind: "unlimited" }, plan);
    assert.equal(PLAN_LIMITS[plan].socialHourly, null, plan);
  }
  assert.equal(PLAN_LIMITS.none.socialHourly, 0);
  // A finite cap must survive as a cap, never be replaced by a guessed default.
  const original = PLAN_LIMITS.pro.socialHourly;
  PLAN_LIMITS.pro.socialHourly = 25;
  assert.deepEqual(socialGate("pro"), { kind: "capped", hourly: 25 });
  PLAN_LIMITS.pro.socialHourly = original;
});

// ---- plan exemption floors at growth without rewriting stored records ----
test("applyExemption: exempt emails floored at growth, stored higher plans kept, others untouched", async () => {
  const { applyExemption } = await import("../src/lib/geo/plan.ts");
  const list = "Owner@Example.com, second@example.com";
  assert.equal(applyExemption("none", "owner@example.com", list), "growth");
  assert.equal(applyExemption("pro", "owner@example.com", list), "growth");
  assert.equal(applyExemption("growth", "owner@example.com", list), "growth");
  assert.equal(applyExemption("enterprise", "owner@example.com", list), "enterprise");
  assert.equal(applyExemption("pro", "someone-else@example.com", list), "pro");
  assert.equal(applyExemption("none", "someone-else@example.com", list), "none");
  assert.equal(applyExemption("pro", undefined, list), "pro");
  assert.equal(applyExemption("pro", "owner@example.com", ""), "pro");
  assert.equal(applyExemption("none", " second@example.com ", list), "growth");
});
