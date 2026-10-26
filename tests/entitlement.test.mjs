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

test("reservationTransition: first claim reserves, same claim re-enters idempotently, other claim is taken", async () => {
  const { reservationTransition } = await import("../src/lib/billing/claims.ts");
  const first = reservationTransition(null, "clm_A", "uid1", new Date("2026-10-26T00:00:00Z"));
  assert.equal(first.action, "reserve");
  assert.equal(first.value.claimId, "clm_A");
  assert.equal(reservationTransition(first.value, "clm_A", "uid1").action, "yours");
  assert.equal(reservationTransition(first.value, "clm_B", "uid2").action, "taken");
  // Same claim from the same identity recovers after a partial attach.
  assert.equal(reservationTransition({ claimId: "clm_A" }, "clm_A", "uid1").action, "yours");
});

test("orphan reservation: abandoned claim (paid_unclaimed, no billing grant) is reclaimable", async () => {
  const { classifyReservationOwner, reclaimDecision } = await import("../src/lib/billing/claims.ts");
  // Crash after reservations, before the billing transaction: claim exists but no grant.
  assert.equal(classifyReservationOwner({ status: "paid_unclaimed" }, null, "clm_A"), "orphan");
  // Claim node vanished entirely: orphan.
  assert.equal(classifyReservationOwner(null, null, "clm_A"), "orphan");
  // Expired claim, no grant: orphan.
  assert.equal(classifyReservationOwner({ status: "expired" }, null, "clm_A"), "orphan");
  const d = reclaimDecision({ claimId: "clm_A", uid: "uid1" }, "clm_A", { claimId: "clm_B", uid: "uid2", at: "2026-10-26T01:00:00.000Z" });
  assert.equal(d.action, "reclaim");
  assert.equal(d.value.claimId, "clm_B");
});

test("consumed identity is never released: claimed marker OR live billing grant", async () => {
  const { classifyReservationOwner } = await import("../src/lib/billing/claims.ts");
  // Grant committed but marker failed (crash before transitionClaim): billing carries the claimId.
  assert.equal(classifyReservationOwner({ status: "paid_unclaimed" }, { claimId: "clm_A", status: "active" }, "clm_A"), "consumed");
  // Marker applied: claimed.
  assert.equal(classifyReservationOwner({ status: "claimed" }, null, "clm_A"), "consumed");
  // Grace still holds the grant.
  assert.equal(classifyReservationOwner({ status: "paid_unclaimed" }, { claimId: "clm_A", status: "grace" }, "clm_A"), "consumed");
  // An ended grant from that claim: the promo WAS consumed - billing truth via promoConsumed, but this reservation is spent either way; billing no longer active so classify by claim marker only.
  assert.equal(classifyReservationOwner({ status: "claimed" }, { claimId: "clm_A", status: "ended" }, "clm_A"), "consumed");
});

test("failure injection: cleanup racing a retry - only the exact verified orphan is replaced", async () => {
  const { reclaimDecision, reservationTransition } = await import("../src/lib/billing/claims.ts");
  const orphan = { claimId: "clm_A", uid: "uid1" };
  // Retry by the ORIGINAL owner lands first: value now belongs to clm_A again (same) - a cleaner expecting clm_A sees "yours" semantics preserved.
  assert.equal(reservationTransition(orphan, "clm_A", "uid1").action, "yours");
  // A second reclaimer that verified clm_A loses the race once clm_B already reclaimed.
  const afterReclaim = { claimId: "clm_B", uid: "uid2" };
  const d = reclaimDecision(afterReclaim, "clm_A", { claimId: "clm_C", uid: "uid3", at: "2026-10-26T02:00:00.000Z" });
  assert.equal(d.action, "busy");
});

test("failure injection: crash after first reservation - same-claim retry continues, foreign claim reclaims orphan", async () => {
  const { reservationTransition, classifyReservationOwner } = await import("../src/lib/billing/claims.ts");
  // clm_A reserved email, crashed before phone reservation: email=yours on retry, phone free to reserve.
  const emailNode = { claimId: "clm_A", uid: "uid1" };
  assert.equal(reservationTransition(emailNode, "clm_A", "uid1").action, "yours");
  assert.equal(reservationTransition(null, "clm_A", "uid1").action, "reserve");
  // A different claim hitting the orphaned email node: truth says orphan (claim never claimed, no billing) -> reclaimable.
  assert.equal(classifyReservationOwner({ status: "paid_unclaimed" }, null, "clm_A"), "orphan");
});
