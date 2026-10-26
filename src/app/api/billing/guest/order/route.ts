import { errorResponse, readJsonBody } from "@/lib/api-request";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { loadBilling } from "@/lib/billing/store";
import { billingTestMode, isInterval, isPaidPlan } from "@/lib/billing/dodo";
import { ORDER_PRICES, razorpayConfigured, razorpayCreateOrder, razorpayKeyId } from "@/lib/billing/razorpay";
import { newClaimSecret, saveClaim, type BillingClaim } from "@/lib/billing/claims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/guest/order - public pre-payment disclosure probe.
export async function GET() {
  return Response.json(
    { testMode: billingTestMode(), available: razorpayConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST /api/billing/guest/order - start checkout WITHOUT sign-in. Creates a
// Razorpay order (server-priced) plus a durable claim record. The claim secret
// is returned once and is the only proof of purchase authority.
export async function POST(request: Request) {
  try {
    if (!razorpayConfigured()) {
      return Response.json({ error: "Checkout is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown };
    if (!isPaidPlan(body.plan) || !isInterval(body.interval)) {
      return Response.json({ error: "Choose a plan (pro or growth) and interval (monthly or annual)." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    // Server-side duplicate guard: when the visitor sends a valid sign-in token
    // (the checkout page always does for signed-in users), an account that
    // already holds an active plan is refused BEFORE any order exists - a
    // second purchase must be managed/upgraded from billing, not bought again.
    // Token absence or a lookup failure never blocks the genuine guest path.
    try {
      const identity = await getFirebaseIdentity(request, true);
      if (identity) {
        const existing = await withWorkspace(identity.uid, identity.idToken, () => loadBilling());
        if (existing && (existing.status === "active" || existing.status === "grace")) {
          return Response.json(
            { error: "This account already has an active plan - manage or upgrade it from billing settings instead of buying again.", code: "active_plan" },
            { status: 409, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    } catch {
      // Soft check only - fall through to the guest path.
    }
    const now = new Date();
    const { secret, hash } = newClaimSecret();
    const order = await razorpayCreateOrder({
      plan: body.plan,
      interval: body.interval,
      workspaceUid: `guest_${now.getTime().toString(36)}`,
      email: "",
    });
    const price = ORDER_PRICES[body.plan][body.interval];
    const claim: BillingClaim = {
      id: `clm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      provider: "razorpay",
      plan: body.plan,
      interval: body.interval,
      amount: price.amount,
      currency: price.currency,
      orderId: order.id,
      paymentId: null,
      status: "pending",
      claimTokenHash: hash,
      checkoutEmail: null,
      checkoutContact: null,
      claimedBy: null,
      claimedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await saveClaim(claim);
    return Response.json(
      { orderId: order.id, amount: price.amount, currency: price.currency, keyId: razorpayKeyId(), claimId: claim.id, claimSecret: secret, testMode: billingTestMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Guest order");
  }
}
