import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { isInterval, isRazorpayPlan } from "@/lib/billing/dodo";
import { orderPrice, razorpayCheckoutAllowed, razorpayCreateOrder, razorpayFetchOrder, razorpayFindOrdersByReceipt, razorpayKeyId, razorpayOperational, razorpayTestMode, resolvePaidThisTerm, upgradeQuote } from "@/lib/billing/razorpay";
import { decideRazorpayBlockedAction } from "@/lib/billing/recovery";
import { lookupVerifiedPhone, normalizeE164 } from "@/lib/billing/identity";
import type { CheckoutAttempt } from "@/lib/billing/attempt";
import { claimCheckoutAttempt, loadBilling, saveCheckoutAttempt } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/razorpay/order - create a Razorpay order for Standard
// Checkout. Pricing is server-authoritative (ORDER_PRICES); the client picks
// plan + interval only.
export async function POST(request: Request) {
  try {
    if (!razorpayOperational()) {
      return Response.json({ error: "Razorpay is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json({ error: "Only the workspace owner can manage billing." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (!razorpayCheckoutAllowed(access.identity.email)) {
      return Response.json(
        { error: "Billing is in test mode while launch is prepared - checkout is not open yet." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (access.identity.idToken === "demo-token") {
      return Response.json(
        { error: "The demo workspace cannot check out. Sign in with Google to subscribe." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown; billingCountry?: unknown };
    // Region routing (owner-directed 27 Oct 2026): Razorpay serves India
    // billing countries only; every other region belongs to Dodo.
    if ((typeof body.billingCountry === "string" ? body.billingCountry.trim().toUpperCase() : "") !== "IN") {
      return Response.json(
        { error: "Razorpay checkout is available for India billing addresses only.", code: "region_mismatch" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!isRazorpayPlan(body.plan) || !isInterval(body.interval) || !orderPrice(body.plan, body.interval)) {
      return Response.json(
        { error: "Choose a plan (trial, pro or growth) with a valid term." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const existing = await inWorkspace(access, () => loadBilling());
    // An active paid trial never blocks a real purchase: trial to paid is a
    // fresh order at full price, not a prorated upgrade.
    let quote: ReturnType<typeof upgradeQuote> = null;
    if (existing && (existing.status === "active" || existing.status === "grace") && existing.plan !== "trial") {
      // Upgrades: only for Razorpay one-time purchases, same interval, to a
      // higher-priced plan, paying the prorated difference. Dodo subscriptions
      // and downgrades keep the manage flow.
      if (existing.provider !== "razorpay" || !existing.periodEnd) {
        return Response.json(
          { error: "This workspace already has a subscription. Manage it from Settings - Billing." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      const paidThisTerm = await resolvePaidThisTerm(existing);
      if (paidThisTerm === null) {
        return Response.json(
          { error: "Could not confirm the amount paid for the current term - no upgrade order was created." },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      quote = upgradeQuote({
        currentPlan: existing.plan as import("@/lib/billing/dodo").PaidPlanId,
        newPlan: body.plan as import("@/lib/billing/dodo").PaidPlanId,
        interval: body.interval,
        purchasedAt: existing.updatedAt,
        periodEnd: existing.periodEnd,
        paidThisTerm,
      });
      if (!quote) {
        return Response.json(
          { error: "That change is not an upgrade. Only upgrades to a higher plan on the same term are supported here." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    const now = new Date();
    const attempt: CheckoutAttempt = {
      id: `att_${now.getTime().toString(36)}`,
      provider: "razorpay",
      plan: body.plan,
      interval: body.interval,
      state: "pending",
      checkoutUrl: null,
      providerRef: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    let claim = await claimCheckoutAttempt(access.workspaceUid, attempt, now);
    if (!claim.claimed && claim.existing?.state === "issued" && claim.existing.providerRef) {
      // Issued Razorpay order: provider-backed resume only - fetch the exact
      // order; still-open -> return it (same payable, never a duplicate);
      // paid -> reconcile; anything else -> stay blocked.
      const prior = claim.existing;
      const priorRef = prior.providerRef;
      if (priorRef) try {
        const order = await razorpayFetchOrder(priorRef);
        if (order.status === "created" || order.status === "attempted") {
          const price = orderPrice(prior.plan, prior.interval);
          return Response.json(
            { orderId: priorRef, amount: prior.amount ?? price?.amount ?? null, currency: prior.currency ?? price?.currency ?? null, keyId: razorpayKeyId(), provider: "razorpay", testMode: razorpayTestMode(), resumed: true },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        const amountMatches = (prior.amount == null || order.amount == null || prior.amount === order.amount) && (prior.currency == null || order.currency == null || prior.currency === order.currency);
        if (order.status === "paid" && amountMatches) {
          await saveCheckoutAttempt(access.workspaceUid, { ...prior, state: "reconciled", updatedAt: new Date().toISOString() });
          return Response.json(
            { error: "A payment for this attempt was already recorded. Your plan will reflect it - no new order was created.", state: "reconciled" },
            { status: 409, headers: { "Cache-Control": "no-store" } },
          );
        }
      } catch { /* fetch failure stays blocked */ }
    }
    if (!claim.claimed && claim.existing && (claim.existing.state === "pending" || claim.existing.state === "uncertain")) {
      // Ambiguous prior attempt: reconcile against Razorpay by the attempt's
      // receipt (the create call is retried with the same receipt only after
      // provider-backed absence) - never create on UNKNOWN.
      const receipt = claim.existing.id;
      const first = await razorpayFindOrdersByReceipt(receipt);
      let orders = first;
      let readsAgree = false;
      if (first !== null) {
        await new Promise((r) => setTimeout(r, 1500));
        const second = await razorpayFindOrdersByReceipt(receipt);
        if (second !== null) {
          readsAgree = JSON.stringify(first.map((o) => o.id).sort()) === JSON.stringify(second.map((o) => o.id).sort());
          orders = second;
        } else {
          orders = null;
        }
      }
      const decision = decideRazorpayBlockedAction({ existing: claim.existing, now: new Date(), orders, readsAgree });
      if (decision.action === "resume") {
        await saveCheckoutAttempt(access.workspaceUid, { ...claim.existing, state: "issued", providerRef: decision.orderId, updatedAt: new Date().toISOString() });
        const price = orderPrice(claim.existing.plan, claim.existing.interval);
        return Response.json(
          { orderId: decision.orderId, amount: claim.existing.amount ?? price?.amount ?? null, currency: claim.existing.currency ?? price?.currency ?? null, keyId: razorpayKeyId(), provider: "razorpay", testMode: razorpayTestMode(), resumed: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (decision.action === "mark_reconciled_paid" && (claim.existing.amount == null || orders?.find((o) => o.status === "paid")?.id)) {
        await saveCheckoutAttempt(access.workspaceUid, { ...claim.existing, state: "reconciled", updatedAt: new Date().toISOString() });
        return Response.json(
          { error: "A payment for this attempt was already recorded. Your plan will reflect it - no new order was created.", state: "reconciled" },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    if (!claim.claimed) {
      const current = claim.existing;
      return Response.json(
        {
          error:
            current?.state === "issued"
              ? "A Razorpay order is already open for this workspace. Complete it or wait for it to expire."
              : "A previous checkout attempt is still being reconciled. No new checkout will be created until it expires or confirms.",
          state: current?.state ?? "unknown",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const order = await razorpayCreateOrder({
        plan: body.plan as import("@/lib/billing/dodo").RazorpayPlanId,
        interval: body.interval,
        workspaceUid: access.workspaceUid,
        email: access.identity.email,
        amountOverride: quote?.due,
        upgradeOf: existing?.orderId ?? null,
        receipt: attempt.id,
      });
      await saveCheckoutAttempt(access.workspaceUid, {
        ...attempt,
        state: "issued",
        providerRef: order.id,
        amount: quote ? quote.due : orderPrice(body.plan as import("@/lib/billing/dodo").RazorpayPlanId, body.interval)?.amount ?? null,
        currency: orderPrice(body.plan as import("@/lib/billing/dodo").RazorpayPlanId, body.interval)?.currency ?? null,
        upgradeOf: existing?.orderId ?? null,
        updatedAt: new Date().toISOString(),
      });
      try {
        await appendAudit({
          actor: access.identity.email || access.identity.uid,
          action: "billing.razorpay_order_created",
          detail: `${body.plan} (${body.interval}) ${order.id}${razorpayTestMode() ? " - test mode" : ""}`,
        });
      } catch { /* audit is best-effort */ }
      const price = orderPrice(body.plan, body.interval);
    if (!price) throw new Error("That plan and term combination is not sold.");
      const prefillPhone = await lookupVerifiedPhone(access.identity.idToken);
      if (!normalizeE164(prefillPhone)) {
        return Response.json(
          { error: "Verify the mobile number on your account before checkout - the payment must use the same details." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        { orderId: order.id, amount: quote ? quote.due : price.amount, currency: price.currency, keyId: razorpayKeyId(), provider: "razorpay", testMode: razorpayTestMode(), quote, prefill: { email: access.identity.email || null, contact: prefillPhone } },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      if (status >= 400 && status < 500) {
        await saveCheckoutAttempt(access.workspaceUid, { ...attempt, state: "failed", updatedAt: new Date().toISOString() });
        return Response.json(
          { error: error instanceof Error ? error.message : "Razorpay rejected the order." },
          { status: 502, headers: { "Cache-Control": "no-store" } },
        );
      }
      // Ambiguous: the order may exist without us seeing it. Fail closed.
      await saveCheckoutAttempt(access.workspaceUid, { ...attempt, state: "uncertain", updatedAt: new Date().toISOString() });
      return Response.json(
        { error: "Razorpay did not confirm the order. The attempt is recorded and paused - no new order will be created until it expires or Razorpay confirms it.", state: "uncertain" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    return errorResponse(error, "Razorpay order");
  }
}
