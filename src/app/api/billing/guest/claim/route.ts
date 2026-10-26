import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { savePlan } from "@/lib/geo/plan";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, canCheckout } from "@/lib/billing/dodo";
import { periodEndFor, razorpayConfigured } from "@/lib/billing/razorpay";
import { hashClaimSecret, loadClaim, transitionClaim } from "@/lib/billing/claims";
import { loadBilling, saveBilling } from "@/lib/billing/store";
import { lookupVerifiedPhone, normalizePhoneDigits } from "@/lib/billing/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/guest/claim - attach a paid guest checkout to the signed-in
// workspace. Requires: verified sign-in + the claim secret (purchase
// authority). If the checkout email is known and differs from the claimant's
// verified email, the claim fails closed to uncertain for reconciliation.
export async function POST(request: Request) {
  try {
    if (!razorpayConfigured()) {
      return Response.json({ error: "Checkout is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json({ error: "Only the workspace owner can claim a purchase." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (billingTestMode() && !canCheckout(access.identity.email)) {
      // Test mode: sandbox payments must not grant the public paid features.
      return Response.json({ error: "Billing is in test mode - claiming is limited right now." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as { claimId?: unknown; claimSecret?: unknown };
    if (typeof body.claimId !== "string" || typeof body.claimSecret !== "string" || !body.claimId || !body.claimSecret) {
      return Response.json({ error: "Missing claim credentials." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const claim = await loadClaim(body.claimId);
    if (!claim || claim.claimTokenHash !== hashClaimSecret(body.claimSecret)) {
      return Response.json({ error: "Invalid claim link." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (claim.status === "claimed") {
      return Response.json({ error: "This purchase was already claimed." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (claim.status !== "paid_unclaimed") {
      return Response.json({ error: `This purchase is ${claim.status} - it cannot be claimed yet.` }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const claimantEmail = (access.identity.email || "").toLowerCase();
    if (claim.checkoutEmail && claim.checkoutEmail.toLowerCase() !== claimantEmail) {
      await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "uncertain" }));
      return Response.json(
        { error: "The email on the payment does not match this account. The claim is paused for review - no entitlement was granted." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Phone cross-check: accounts hold a verified phone. When both the
    // checkout contact and the account phone are known and differ, pause the
    // claim rather than attach to the wrong account. Digits-only comparison
    // on the trailing 10 digits (country-code tolerant).
    const claimantPhone = await lookupVerifiedPhone(access.identity.idToken);
    const checkoutDigits = normalizePhoneDigits(claim.checkoutContact);
    const accountDigits = normalizePhoneDigits(claimantPhone);
    if (checkoutDigits && accountDigits && checkoutDigits !== accountDigits) {
      await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "uncertain" }));
      return Response.json(
        { error: "The mobile number on the payment does not match this account. The claim is paused for review - no entitlement was granted." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const existing = await inWorkspace(access, () => loadBilling());
    if (existing && (existing.status === "active" || existing.status === "grace")) {
      return Response.json({ error: "This workspace already has a plan. Manage it from Settings - Billing." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const now = new Date();
    const periodEnd = periodEndFor(claim.interval, now);
    const t = await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "claimed", claimedBy: access.workspaceUid, claimedAt: now.toISOString() }));
    if (!t.applied) {
      return Response.json({ error: "This purchase was already claimed." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    await inWorkspace(access, async () => {
      await savePlan(claim.plan);
      await saveBilling({
        provider: "razorpay",
        plan: claim.plan,
        interval: claim.interval,
        status: "active",
        subscriptionId: null,
        customerId: null,
        customerEmail: access.identity.email || null,
        mode: billingTestMode() ? "test" : "live",
        updatedAt: now.toISOString(),
        periodEnd,
        orderId: claim.orderId,
        paidThisTerm: claim.amount,
      });
    });
    try {
      await appendAudit({
        actor: access.identity.email || access.identity.uid,
        action: "billing.guest_claim_applied",
        detail: `${claim.plan} (${claim.interval}) until ${periodEnd} - order ${claim.orderId}${billingTestMode() ? " - test mode" : ""}`,
      });
    } catch { /* audit is best-effort */ }
    return Response.json({ claimed: true, plan: claim.plan, periodEnd }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Guest claim");
  }
}
