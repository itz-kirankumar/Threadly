import { errorResponse, readJsonBody } from "@/lib/api-request";
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
