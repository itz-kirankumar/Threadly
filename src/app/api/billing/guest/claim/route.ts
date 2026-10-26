import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { savePlan } from "@/lib/geo/plan";
import { appendAudit } from "@/lib/geo/store";

import { periodEndFor, razorpayCheckoutAllowed, razorpayOperational, razorpayTestMode } from "@/lib/billing/razorpay";
import { hashClaimSecret, listPromoClaims, loadClaim, reconcileClaimWithProvider, transitionClaim } from "@/lib/billing/claims";
import { loadBilling, saveBilling } from "@/lib/billing/store";
import { lookupVerifiedPhone, normalizeE164 } from "@/lib/billing/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/guest/claim - attach a paid guest checkout to the signed-in
// workspace. Requires: verified sign-in + the claim secret (purchase
// authority). If the checkout email is known and differs from the claimant's
// verified email, the claim fails closed to uncertain for reconciliation.
export async function POST(request: Request) {
  try {
    if (!razorpayOperational()) {
      return Response.json({ error: "Checkout is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json({ error: "Only the workspace owner can claim a purchase." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (!razorpayCheckoutAllowed(access.identity.email)) {
      // Test mode: sandbox payments must not grant the public paid features.
      return Response.json({ error: "Billing is in test mode - claiming is limited right now." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as { claimId?: unknown; claimSecret?: unknown };
    if (typeof body.claimId !== "string" || typeof body.claimSecret !== "string" || !body.claimId || !body.claimSecret) {
      return Response.json({ error: "Missing claim credentials." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    let claim = await loadClaim(body.claimId);
    if (!claim || claim.claimTokenHash !== hashClaimSecret(body.claimSecret)) {
      return Response.json({ error: "Invalid claim link." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    // Recovery path: a payment captured while the buyer's browser never
    // confirmed leaves the claim pending. Refresh it against the provider
    // here so a valid claim link works without waiting for the daily sweep.
    if (claim.status === "pending") {
      try {
        const status = await reconcileClaimWithProvider(claim);
        if (status !== claim.status) claim = { ...claim, status };
      } catch {
        // Provider unreachable - keep the honest pending state.
      }
    }
    if (claim.status === "claimed") {
      return Response.json({ error: "This purchase was already claimed." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (claim.status !== "paid_unclaimed") {
      return Response.json({ error: `This purchase is ${claim.status} - it cannot be claimed yet.` }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const claimantEmail = (access.identity.email || "").trim().toLowerCase();
    // Provider-side contacts are the purchase's ownership evidence. Missing or
    // unverifiable email/contact can never silently attach on secret
    // possession alone - the claim pauses for review instead.
    const checkoutEmail = (claim.checkoutEmail || "").trim().toLowerCase();
    if (!checkoutEmail || !claimantEmail || checkoutEmail !== claimantEmail) {
      await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "uncertain" }));
      return Response.json(
        { error: `The email on the payment does not match this account, so the claim is paused for review - your plan has not been activated. Reference ${claim.id} at hello@gothreadly.live.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Phone cross-check: canonical E.164 only - country code + full national
    // number, exact match. Ambiguous or missing country context never matches;
    // the claim pauses instead of attaching to the wrong account.
    const claimantPhone = await lookupVerifiedPhone(access.identity.idToken);
    const checkoutPhone = normalizeE164(claim.checkoutContact);
    const accountPhone = normalizeE164(claimantPhone);
    if (!checkoutPhone) {
      await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "uncertain" }));
      return Response.json(
        { error: `The payment record has no verifiable mobile number, so the claim is paused for review - your plan has not been activated. Reference ${claim.id} at hello@gothreadly.live.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!accountPhone) {
      // Account-side gap the user can fix - the claim stays claimable.
      return Response.json(
        { error: "Verify the mobile number on your Threadly account first, then open this claim link again - the payment must match your account details." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (checkoutPhone !== accountPhone) {
      await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "uncertain" }));
      return Response.json(
        { error: `The mobile number on the payment does not match this account, so the claim is paused for review - your plan has not been activated. Reference ${claim.id} at hello@gothreadly.live.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const existing = await inWorkspace(access, () => loadBilling());
    if (existing && (existing.status === "active" || existing.status === "grace")) {
      // Paid but not attachable: fail closed, keep the claim untouched, and
      // give a safe reference (claim ID alone grants nothing) for support
      // reconciliation. No promise of outcome - it is pending review.
      return Response.json(
        { error: `This account already has an active plan, so this purchase has not been linked. Do not pay again - contact hello@gothreadly.live with reference ${claim.id} and the purchase will be reviewed.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Promo consumption is enforced HERE, on verified identity: one promo
    // trial per account / verified email / verified phone. The new claim is
    // not consumed by this check - it pauses for review instead of attaching.
    if (claim.provider === "promo") {
      const used = (await listPromoClaims()).find(
        (c) =>
          c.status === "claimed" &&
          c.id !== claim.id &&
          (c.claimedBy === access.workspaceUid ||
            (c.checkoutEmail || "").toLowerCase() === claimantEmail ||
            (c.checkoutContact && normalizeE164(c.checkoutContact) === accountPhone)),
      );
      if (used) {
        await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "uncertain" }));
        return Response.json(
          { error: `This promotion has already been redeemed with this account or these details, so this claim is paused for review - your plan has not been activated. Reference ${claim.id} at hello@gothreadly.live.` },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
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
        provider: claim.provider,
        plan: claim.plan,
        interval: claim.interval,
        status: "active",
        subscriptionId: null,
        customerId: null,
        customerEmail: access.identity.email || null,
        mode: claim.provider === "promo" ? "live" : razorpayTestMode() ? "test" : "live",
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
        detail: `${claim.plan} (${claim.interval}) until ${periodEnd} - order ${claim.orderId}${razorpayTestMode() ? " - test mode" : ""}`,
      });
    } catch { /* audit is best-effort */ }
    return Response.json({ claimed: true, plan: claim.plan, periodEnd }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Guest claim");
  }
}
