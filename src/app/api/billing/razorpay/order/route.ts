import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, canCheckout, isInterval, isPaidPlan } from "@/lib/billing/dodo";
import { ORDER_PRICES, razorpayConfigured, razorpayCreateOrder, razorpayKeyId, resolvePaidThisTerm, upgradeQuote } from "@/lib/billing/razorpay";
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
    if (!razorpayConfigured()) {
      return Response.json({ error: "Razorpay is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json({ error: "Only the workspace owner can manage billing." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (!canCheckout(access.identity.email)) {
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
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown };
    if (!isPaidPlan(body.plan) || !isInterval(body.interval)) {
      return Response.json(
        { error: "Choose a plan (pro or growth) and interval (monthly or annual)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const existing = await inWorkspace(access, () => loadBilling());
    let quote: ReturnType<typeof upgradeQuote> = null;
    if (existing && (existing.status === "active" || existing.status === "grace")) {
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
        currentPlan: existing.plan,
        newPlan: body.plan,
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
    const claim = await claimCheckoutAttempt(access.workspaceUid, attempt, now);
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
        plan: body.plan,
        interval: body.interval,
        workspaceUid: access.workspaceUid,
        email: access.identity.email,
        amountOverride: quote?.due,
        upgradeOf: existing?.orderId ?? null,
      });
      await saveCheckoutAttempt(access.workspaceUid, {
        ...attempt,
        state: "issued",
        providerRef: order.id,
        amount: quote ? quote.due : ORDER_PRICES[body.plan][body.interval].amount,
        currency: ORDER_PRICES[body.plan][body.interval].currency,
        upgradeOf: existing?.orderId ?? null,
        updatedAt: new Date().toISOString(),
      });
      try {
        await appendAudit({
          actor: access.identity.email || access.identity.uid,
          action: "billing.razorpay_order_created",
          detail: `${body.plan} (${body.interval}) ${order.id}${billingTestMode() ? " - test mode" : ""}`,
        });
      } catch { /* audit is best-effort */ }
      const price = ORDER_PRICES[body.plan][body.interval];
      const prefillPhone = await lookupVerifiedPhone(access.identity.idToken);
      if (!normalizeE164(prefillPhone)) {
        return Response.json(
          { error: "Verify the mobile number on your account before checkout - the payment must use the same details." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        { orderId: order.id, amount: quote ? quote.due : price.amount, currency: price.currency, keyId: razorpayKeyId(), provider: "razorpay", testMode: billingTestMode(), quote, prefill: { email: access.identity.email || null, contact: prefillPhone } },
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
