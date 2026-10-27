import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess, inWorkspace } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { billingConfigured, billingTestMode, canCheckout, dodoClient, isInterval, isPaidPlan, productFor } from "@/lib/billing/dodo";
import { razorpaySubscriptionsConfigured, razorpayCreateSubscription, razorpayOperational, razorpayTestMode } from "@/lib/billing/razorpay";
import { routeProviderForRegion } from "@/lib/billing/region-routing";
import type { CheckoutAttempt } from "@/lib/billing/attempt";
import { claimCheckoutAttempt, loadBilling, loadCheckoutAttempt, saveCheckoutAttempt } from "@/lib/billing/store";
import { decideDodoBlockedAction } from "@/lib/billing/recovery";
import type { BillingProvider } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!billingConfigured() && !razorpayOperational()) {
      return Response.json({ error: "Billing is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json({ error: "Only the workspace owner can manage billing." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (access.identity.idToken === "demo-token") {
      return Response.json(
        { error: "The demo workspace cannot check out. Sign in with Google to subscribe." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown; billingCountry?: unknown };
    if (!isPaidPlan(body.plan) || !isInterval(body.interval)) {
      return Response.json(
        { error: "Choose a plan (pro or growth) and interval (monthly or annual)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://www.gothreadly.live";

    // Region routing (owner-directed 27 Oct 2026): the buyer's billing country
    // selects the provider - India -> Razorpay, every other region -> Dodo.
    // No free provider choice and no cross-provider fallback here.
    const route = routeProviderForRegion({
      billingCountry: typeof body.billingCountry === "string" ? body.billingCountry : null,
      dodoOperational: billingConfigured() && !billingTestMode(),
      razorpayOperational: razorpayOperational(),
    });
    if (!route.ok) {
      const msg =
        route.reason === "missing_country"
          ? "Choose your billing country so we can route checkout correctly."
          : "Checkout is temporarily unavailable for your region.";
      return Response.json(
        { error: msg, code: route.reason },
        { status: route.reason === "missing_country" ? 400 : 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (route.provider === "razorpay") {
      // India billing country: the Razorpay order flow owns checkout.
      return Response.json(
        { error: "India checkout runs through Razorpay - use the India checkout option.", code: "use_razorpay" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const providers: BillingProvider[] = ["dodo"];
    // The test-mode allowlist gates Dodo only - never the live Razorpay path.
    if (providers.includes("dodo") && billingTestMode() && !canCheckout(access.identity.email)) {
      return Response.json(
        { error: "Billing is in test mode while launch is prepared - checkout is not open yet." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Never open a checkout while a subscription is live or in dunning.
    const existing = await inWorkspace(access, () => loadBilling());
    if (existing && (existing.status === "active" || existing.status === "grace")) {
      return Response.json(
        { error: "This workspace already has a subscription. Manage it from Settings - Billing." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date();
    const attempt: CheckoutAttempt = {
      id: `att_${now.getTime().toString(36)}`,
      provider: providers[0],
      plan: body.plan,
      interval: body.interval,
      state: "pending",
      checkoutUrl: null,
      providerRef: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    // One durable attempt per workspace, claimed atomically. A blocked claim
    // means an earlier attempt is unresolved - no new link is created anywhere.
    let claim = await claimCheckoutAttempt(access.workspaceUid, attempt, now);
    if (!claim.claimed && claim.existing && claim.existing.provider === "dodo" && (claim.existing.state === "pending" || claim.existing.state === "uncertain")) {
      // Ambiguous Dodo session create: after the session TTL, a fresh session
      // is safe ONLY when a payments lookup finds nothing for this workspace
      // (a session may have been paid despite the lost response; metadata is
      // copied from the session to the payment). Lookup failure stays blocked.
      const prior = claim.existing;
      let paymentFound: boolean | null = null;
      try {
        const list = await dodoClient().payments.list({ page_size: 50 });
        const items = (list as unknown as { items?: Array<{ metadata?: Record<string, unknown>; created_at?: string }> }).items ?? [];
        const since = Date.parse(prior.createdAt) - 5 * 60 * 1000;
        paymentFound = items.some((pay) => {
          const md = pay.metadata ?? {};
          if (md.workspace_uid !== access.workspaceUid) return false;
          const ts = pay.created_at ? Date.parse(pay.created_at) : NaN;
          return Number.isNaN(ts) || ts >= since;
        });
      } catch {
        paymentFound = null;
      }
      const decision = decideDodoBlockedAction({ existing: prior, now: new Date(), paymentFound });
      if (decision.action === "mark_reconciled_paid") {
        await saveCheckoutAttempt(access.workspaceUid, { ...prior, state: "reconciled", updatedAt: new Date().toISOString() });
        return Response.json(
          { error: "A payment for this attempt was already recorded. Your plan will reflect it - no new checkout was created.", state: "reconciled" },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    if (!claim.claimed) {
      const current = claim.existing;
      return Response.json(
        {
          error:
            current?.state === "issued" && current.checkoutUrl
              ? "A checkout link was already issued for this workspace. Complete it or wait for it to expire."
              : "A previous checkout attempt is still being reconciled. No new checkout will be created until it expires or confirms.",
          state: current?.state ?? "unknown",
          ...(current?.state === "issued" && current.checkoutUrl ? { checkoutUrl: current.checkoutUrl, provider: current.provider } : {}),
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    let lastError = "No payment provider is available right now. Please try again shortly.";
    for (const provider of providers) {
      if (provider === "dodo" && !billingConfigured()) continue;
      if (provider === "razorpay" && !razorpayOperational()) continue;
      const attemptForProvider: CheckoutAttempt = { ...attempt, provider, updatedAt: new Date().toISOString() };
      await saveCheckoutAttempt(access.workspaceUid, attemptForProvider);
      // Missing local plan ids are a definitive setup failure: nothing reaches
      // Razorpay, so mark the attempt failed (freeing the slot) instead of
      // recording false provider "uncertain" state that blocks checkout for 24h.
      if (provider === "razorpay" && !razorpaySubscriptionsConfigured()) {
        await saveCheckoutAttempt(access.workspaceUid, { ...attemptForProvider, state: "failed", updatedAt: new Date().toISOString() });
        return Response.json(
          { error: "Razorpay subscription plans are not configured on this deployment." },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      try {
        if (provider === "dodo") {
          const session = await dodoClient().checkoutSessions.create({
            product_cart: [{ product_id: productFor(body.plan, body.interval), quantity: 1 }],
            customer: { email: access.identity.email, name: access.identity.name || undefined },
            return_url: `${origin}/portal?billing=success`,
            metadata: { workspace_uid: access.workspaceUid, plan: body.plan, interval: body.interval },
          });
          if (!session.checkout_url) throw new Error("Dodo did not return a checkout link.");
          await saveCheckoutAttempt(access.workspaceUid, {
            ...attemptForProvider,
            state: "issued",
            checkoutUrl: session.checkout_url,
            providerRef: session.session_id ?? null,
            updatedAt: new Date().toISOString(),
          });
          try {
            await appendAudit({
              actor: access.identity.email || access.identity.uid,
              action: "billing.checkout_started",
              detail: `${body.plan} (${body.interval}) via dodo${billingTestMode() ? " - test mode" : ""}`,
            });
          } catch { /* audit is best-effort */ }
          return Response.json(
            { checkoutUrl: session.checkout_url, provider: "dodo", testMode: billingTestMode() },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        const subscription = await razorpayCreateSubscription({
          plan: body.plan,
          interval: body.interval,
          email: access.identity.email,
          workspaceUid: access.workspaceUid,
        });
        if (!subscription.short_url) throw new Error("Razorpay did not return a checkout link.");
        await saveCheckoutAttempt(access.workspaceUid, {
          ...attemptForProvider,
          state: "issued",
          checkoutUrl: subscription.short_url,
          providerRef: subscription.id,
          updatedAt: new Date().toISOString(),
        });
        try {
          await appendAudit({
            actor: access.identity.email || access.identity.uid,
            action: "billing.checkout_started",
            detail: `${body.plan} (${body.interval}) via razorpay${razorpayTestMode() ? " - test mode" : ""}`,
          });
        } catch { /* audit is best-effort */ }
        return Response.json(
          { checkoutUrl: subscription.short_url, provider: "razorpay", testMode: razorpayTestMode() },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        const status = (error as { status?: number }).status ?? 0;
        lastError = error instanceof Error ? error.message : "Provider checkout failed.";
        if (status >= 400 && status < 500) {
          // Definitive rejection: a 4xx means the provider rejected the request
          // itself - no session/subscription was created. Mark failed; failover
          // (when enabled) may try the backup provider.
          await saveCheckoutAttempt(access.workspaceUid, { ...attemptForProvider, state: "failed", updatedAt: new Date().toISOString() });
          continue;
        }
        // Ambiguous outcome (network loss / 5xx / timeout): the provider may
        // have created a session without us seeing the response. Fail CLOSED:
        // record the attempt as uncertain, do not retry, do not fail over. The
        // attempt expires after the provider's link validity window, and an
        // incoming webhook for it reconciles it sooner.
        await saveCheckoutAttempt(access.workspaceUid, { ...attemptForProvider, state: "uncertain", updatedAt: new Date().toISOString() });
        return Response.json(
          {
            error: "The payment provider did not confirm the checkout. The attempt is recorded and paused - no new checkout will be created until it expires or the provider confirms it.",
            state: "uncertain",
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    return Response.json({ error: lastError }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Billing checkout");
  }
}
