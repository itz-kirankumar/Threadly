import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { billingConfigured, billingTestMode, canCheckout, dodoClient, isInterval, isPaidPlan, productFor } from "@/lib/billing/dodo";
import { razorpayConfigured, razorpayCreateSubscription } from "@/lib/billing/razorpay";
import { inWorkspace } from "@/lib/geo/team";
import { loadBilling } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!billingConfigured() && !razorpayConfigured()) {
      return Response.json(
        { error: "Billing is not available yet." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json(
        { error: "Only the workspace owner can manage billing." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
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
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown; provider?: unknown };
    if (!isPaidPlan(body.plan) || !isInterval(body.interval)) {
      return Response.json(
        { error: "Choose a plan (pro or growth) and interval (monthly or annual)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://www.gothreadly.live";
    const requested = body.provider === "dodo" || body.provider === "razorpay" ? body.provider : "auto";

    // Never open a second checkout while a subscription is live or in dunning -
    // this is what actually prevents double subscriptions across providers,
    // including explicit provider overrides.
    const existing = await inWorkspace(access, () => loadBilling());
    if (existing && (existing.status === "active" || existing.status === "grace")) {
      return Response.json(
        { error: "This workspace already has a subscription. Manage it from Settings - Billing." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Provider redundancy: Dodo is primary, Razorpay the backup.
    // Safety rules:
    // - Never fail over after Dodo returned a checkout link (exactly one link
    //   ever reaches the customer, so no double charge is possible).
    // - A thrown error does NOT prove nothing was created (the response may
    //   have been lost in transit). But an orphan checkout session is only an
    //   unpaid link nobody sees - it cannot charge anyone - so after a network
    //   or 5xx failure we retry Dodo once, then fail over. A definitive 4xx
    //   rejection fails over immediately.
    let checkoutUrl: string | null = null;
    let usedProvider: "dodo" | "razorpay" = "dodo";
    let dodoError: string | null = null;
    if ((requested === "auto" || requested === "dodo") && billingConfigured()) {
      for (let attempt = 0; attempt < 2 && !checkoutUrl; attempt += 1) {
        try {
          const session = await dodoClient().checkoutSessions.create({
            product_cart: [{ product_id: productFor(body.plan, body.interval), quantity: 1 }],
            customer: { email: access.identity.email, name: access.identity.name || undefined },
            return_url: `${origin}/portal?billing=success`,
            metadata: {
              workspace_uid: access.workspaceUid,
              plan: body.plan,
              interval: body.interval,
            },
          });
          checkoutUrl = session.checkout_url ?? null;
          usedProvider = "dodo";
        } catch (error) {
          const status = (error as { status?: number }).status ?? 0;
          dodoError = error instanceof Error ? error.message : "Dodo checkout failed.";
          if (status >= 400 && status < 500) break; // definitive rejection - fail over now
          // network/5xx: loop retries Dodo once before failover
        }
      }
    }
    if (!checkoutUrl && (requested === "razorpay" || (requested === "auto" && dodoError !== null)) && razorpayConfigured()) {
      const subscription = await razorpayCreateSubscription({
        plan: body.plan,
        interval: body.interval,
        email: access.identity.email,
        workspaceUid: access.workspaceUid,
      });
      if (!subscription.short_url) throw new Error("Razorpay did not return a checkout link.");
      checkoutUrl = subscription.short_url;
      usedProvider = "razorpay";
    }
    if (!checkoutUrl) {
      if (requested === "dodo" && dodoError) throw new Error(dodoError);
      return Response.json(
        { error: "No payment provider is available right now. Please try again shortly." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      await appendAudit({
        actor: access.identity.email || access.identity.uid,
        action: "billing.checkout_started",
        detail: `${body.plan} (${body.interval}) via ${usedProvider}${usedProvider === "razorpay" && dodoError ? ` - dodo unavailable: ${dodoError.slice(0, 120)}` : ""}${billingTestMode() ? " - test mode" : ""}`,
      });
    } catch {
      // audit is best-effort
    }
    return Response.json(
      { checkoutUrl, provider: usedProvider, testMode: billingTestMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Billing checkout");
  }
}
