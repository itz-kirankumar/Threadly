import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { savePlan } from "@/lib/geo/plan";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, canCheckout, isInterval, isPaidPlan } from "@/lib/billing/dodo";
import { ORDER_PRICES, periodEndFor, razorpayConfigured, razorpayFetchPayment, resolvePaidThisTerm, verifyPaymentSignature } from "@/lib/billing/razorpay";
import { lookupVerifiedPhone, normalizePhoneDigits } from "@/lib/billing/identity";
import { loadBilling, loadCheckoutAttempt, saveBilling, saveCheckoutAttempt } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/razorpay/verify - verify a Standard Checkout payment.
// Entitlement is granted ONLY after: (1) HMAC-SHA256 signature check,
// (2) server-side fetch of the payment from Razorpay confirming status +
// amount + currency + workspace binding. Client-supplied fields alone never
// mark anything paid.
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
      return Response.json({ error: "Billing is not open yet." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as {
      orderId?: unknown;
      paymentId?: unknown;
      signature?: unknown;
    };
    if (typeof body.orderId !== "string" || typeof body.paymentId !== "string" || typeof body.signature !== "string"
      || !body.orderId || !body.paymentId || !body.signature) {
      return Response.json({ error: "Missing payment verification fields." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    if (!verifyPaymentSignature(body.orderId, body.paymentId, body.signature)) {
      return Response.json({ error: "Payment verification failed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    let payment;
    try {
      payment = await razorpayFetchPayment(body.paymentId);
    } catch {
      // Cannot confirm with Razorpay - fail closed, keep the attempt uncertain.
      const attempt = await loadCheckoutAttempt(access.workspaceUid);
      if (attempt && attempt.providerRef === body.orderId) {
        await saveCheckoutAttempt(access.workspaceUid, { ...attempt, state: "uncertain", updatedAt: new Date().toISOString() });
      }
      return Response.json(
        { error: "Could not confirm the payment with Razorpay yet. The attempt is recorded - no charge is assumed." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const status = payment.status ?? "";
    if (status !== "captured" && status !== "authorized") {
      return Response.json({ error: `Payment is ${status || "not complete"} - no entitlement granted.` }, { status: 402, headers: { "Cache-Control": "no-store" } });
    }
    if (payment.order_id !== body.orderId) {
      return Response.json({ error: "Payment does not belong to this order." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const notes = payment.notes ?? {};
    const plan = isPaidPlan(notes.plan) ? notes.plan : null;
    const interval = isInterval(notes.interval) ? notes.interval : null;
    if (!plan || !interval || notes.workspace_uid !== access.workspaceUid) {
      return Response.json({ error: "Payment is not bound to this workspace." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const price = ORDER_PRICES[plan][interval];
    if (payment.amount !== price.amount || payment.currency !== price.currency) {
      return Response.json({ error: "Paid amount does not match the plan price." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Same-details rule (owner instruction): the payment's checkout contacts
    // must match the account's verified email/phone when known - a mismatch
    // pauses to uncertain instead of attaching to the wrong account.
    const accountEmail = (access.identity.email || "").toLowerCase();
    const paymentEmail = (payment.email || "").toLowerCase();
    const accountPhone = normalizePhoneDigits(await lookupVerifiedPhone(access.identity.idToken));
    const paymentPhone = normalizePhoneDigits(payment.contact);
    if (
      (paymentEmail && accountEmail && paymentEmail !== accountEmail) ||
      (paymentPhone && (!accountPhone || paymentPhone !== accountPhone))
    ) {
      const attempt0 = await loadCheckoutAttempt(access.workspaceUid);
      if (attempt0 && attempt0.providerRef === body.orderId) {
        await saveCheckoutAttempt(access.workspaceUid, { ...attempt0, state: "uncertain", updatedAt: new Date().toISOString() });
      }
      return Response.json(
        { error: "The email or mobile on the payment does not match this account. The payment is recorded for review - no entitlement was granted." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date();
    const existing = await inWorkspace(access, () => loadBilling());
    if (existing?.orderId === body.orderId && existing.status === "active") {
      return Response.json({ received: true, plan, periodEnd: existing.periodEnd }, { headers: { "Cache-Control": "no-store" } });
    }
    const isUpgrade = (notes as Record<string, string>).upgrade === "1";
    let periodEnd = periodEndFor(interval, now);
    let paidThisTerm: number | null = payment.amount ?? null;
    if (isUpgrade) {
      // Upgrade orders must match the server-stored quote on the attempt and
      // keep the original term end - never silently reset the term.
      const attemptForQuote = await loadCheckoutAttempt(access.workspaceUid);
      if (
        !attemptForQuote ||
        attemptForQuote.providerRef !== body.orderId ||
        attemptForQuote.amount !== payment.amount ||
        !existing?.periodEnd ||
        existing.provider !== "razorpay" ||
        existing.status !== "active"
      ) {
        return Response.json({ error: "Upgrade quote mismatch - no change was applied." }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      periodEnd = existing.periodEnd;
      const priorBasis = await resolvePaidThisTerm(existing);
      if (priorBasis === null) {
        return Response.json({ error: "Could not confirm the prior payment basis - no change was applied." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      paidThisTerm = priorBasis + (payment.amount ?? 0);
    }
    await inWorkspace(access, async () => {
      await savePlan(plan);
      await saveBilling({
        provider: "razorpay",
        plan,
        interval,
        status: "active",
        subscriptionId: null,
        customerId: null,
        customerEmail: access.identity.email || null,
        mode: billingTestMode() ? "test" : "live",
        updatedAt: now.toISOString(),
        periodEnd,
        orderId: body.orderId as string,
        paidThisTerm,
      });
    });
    const attempt = await loadCheckoutAttempt(access.workspaceUid);
    if (attempt && attempt.providerRef === body.orderId) {
      await saveCheckoutAttempt(access.workspaceUid, { ...attempt, state: "reconciled", updatedAt: now.toISOString() });
    }
    try {
      await appendAudit({
        actor: access.identity.email || access.identity.uid,
        action: "billing.razorpay_payment_verified",
        detail: `${plan} (${interval}) until ${periodEnd} - order ${body.orderId}${billingTestMode() ? " - test mode" : ""}`,
      });
    } catch { /* audit is best-effort */ }
    return Response.json({ received: true, plan, periodEnd }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Razorpay verify");
  }
}
