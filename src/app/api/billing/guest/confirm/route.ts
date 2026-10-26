import { errorResponse, readJsonBody } from "@/lib/api-request";
import { ORDER_PRICES, razorpayConfigured, razorpayFetchPayment, verifyPaymentSignature } from "@/lib/billing/razorpay";
import { loadClaim, transitionClaim } from "@/lib/billing/claims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/guest/confirm - after the Razorpay modal succeeds, mark
// the claim paid_unclaimed. Grants NO entitlement by itself: claiming happens
// only after verified sign-in with the claim secret.
export async function POST(request: Request) {
  try {
    if (!razorpayConfigured()) {
      return Response.json({ error: "Checkout is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as {
      claimId?: unknown; orderId?: unknown; paymentId?: unknown; signature?: unknown;
    };
    if (typeof body.claimId !== "string" || typeof body.orderId !== "string" || typeof body.paymentId !== "string" || typeof body.signature !== "string"
      || !body.claimId || !body.orderId || !body.paymentId || !body.signature) {
      return Response.json({ error: "Missing payment confirmation fields." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const claim = await loadClaim(body.claimId);
    if (!claim || claim.orderId !== body.orderId) {
      return Response.json({ error: "Unknown checkout." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (claim.status === "paid_unclaimed" || claim.status === "claimed") {
      return Response.json({ received: true, status: claim.status }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!verifyPaymentSignature(body.orderId, body.paymentId, body.signature)) {
      return Response.json({ error: "Payment verification failed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    let payment;
    try {
      payment = await razorpayFetchPayment(body.paymentId);
    } catch {
      const t = await transitionClaim(claim.id, ["pending"], () => ({ status: "uncertain", paymentId: body.paymentId as string }));
      return Response.json(
        { error: "Could not confirm the payment with Razorpay yet.", status: t.claim?.status ?? "uncertain" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return Response.json({ error: `Payment is ${payment.status || "not complete"}.` , status: payment.status }, { status: 402, headers: { "Cache-Control": "no-store" } });
    }
    if (payment.order_id !== claim.orderId) {
      return Response.json({ error: "Payment does not belong to this checkout." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const price = ORDER_PRICES[claim.plan][claim.interval];
    if (payment.amount !== price.amount || payment.currency !== price.currency) {
      const t = await transitionClaim(claim.id, ["pending"], () => ({ status: "uncertain", paymentId: body.paymentId as string }));
      return Response.json({ error: "Paid amount does not match the plan price.", status: t.claim?.status ?? "uncertain" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const t = await transitionClaim(claim.id, ["pending"], (current) => ({
      status: current.status === "expired" ? current.status : "paid_unclaimed",
      paymentId: body.paymentId as string,
      checkoutEmail: payment.email ?? null,
      checkoutContact: payment.contact ?? null,
    }));
    if (!t.applied) {
      return Response.json({ error: "Checkout state changed - retry the status check." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ received: true, status: t.claim?.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Guest confirm");
  }
}
