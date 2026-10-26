import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { savePlan } from "@/lib/geo/plan";
import { appendAudit } from "@/lib/geo/store";

import { periodEndFor, razorpayCheckoutAllowed, razorpayOperational, razorpayTestMode } from "@/lib/billing/razorpay";
import { hashClaimSecret, loadClaim, reconcileClaimWithProvider, releasePromoIdentity, reservePromoIdentity, transitionClaim } from "@/lib/billing/claims";
import { decideClaimGrant } from "@/lib/billing/entitlement";
import { getAdminDatabase } from "@/lib/geo/admin-store";
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
    const now = new Date();
    const periodEnd = periodEndFor(claim.interval, now);
    // ATOMIC GRANT: the guard and the entitlement write happen in one RTDB
    // transaction on the workspace billing node. Concurrent claims for this
    // workspace have exactly one winner; a loser aborts with its claim left
    // untouched (still claimable after the winner's term ends). An existing
    // active/grace plan is never overwritten, and a lapsed promo blocks a
    // second promo via promoConsumed while still allowing paid purchases.
    // Promo consumption bound to VERIFIED identity, atomically, across
    // accounts: reserve the claimant's verified email + phone BEFORE granting.
    // Reservations keyed by this claim are idempotent (a retry continues) and
    // released if the grant aborts, so nothing leaks eligibility.
    let reservedEmail = false;
    let reservedPhone = false;
    if (claim.provider === "promo") {
      const emailRes = await reservePromoIdentity("email", claimantEmail, claim.id, access.workspaceUid);
      if (emailRes === "taken") {
        return Response.json(
          { error: "This promotion has already been redeemed with this email address, so this claim has not been linked - your existing plan is unchanged." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      reservedEmail = emailRes === "reserved";
      const phoneRes = await reservePromoIdentity("phone", accountPhone as string, claim.id, access.workspaceUid);
      if (phoneRes === "taken") {
        if (reservedEmail) await releasePromoIdentity("email", claimantEmail, claim.id).catch(() => {});
        return Response.json(
          { error: "This promotion has already been redeemed with this mobile number, so this claim has not been linked - your existing plan is unchanged." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      reservedPhone = phoneRes === "reserved";
    }
    const database = await getAdminDatabase();
    if (!database) {
      return Response.json({ error: "Account status is temporarily unavailable - nothing was claimed. Try again shortly.", code: "status_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const billingRef = database.ref(`users/${access.workspaceUid}/geo/billing`);
    let abortReason: "active_plan" | "promo_consumed" | null = null;
    const tx = await billingRef.transaction((current) => {
      const decision = decideClaimGrant(current, {
        provider: claim.provider,
        plan: claim.plan,
        interval: claim.interval,
        amount: claim.amount,
        orderId: claim.orderId,
        claimId: claim.id,
        customerEmail: access.identity.email || null,
        mode: claim.provider === "promo" ? "live" : razorpayTestMode() ? "test" : "live",
        periodEnd,
        now,
      });
      if (!decision.ok) {
        abortReason = decision.reason;
        return undefined; // abort: leave the existing record untouched
      }
      return decision.record;
    });
    if (!tx.committed) {
      if (reservedEmail) await releasePromoIdentity("email", claimantEmail, claim.id).catch(() => {});
      if (reservedPhone) await releasePromoIdentity("phone", accountPhone as string, claim.id).catch(() => {});
      if (abortReason === "promo_consumed") {
        return Response.json(
          { error: "This promotion has already been redeemed on this account, so this claim has not been linked - your existing plan is unchanged." },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      // Paid but not attachable: fail closed, keep the claim untouched, and
      // give a safe reference (claim ID alone grants nothing) for support
      // reconciliation. No promise of outcome - it is pending review.
      return Response.json(
        { error: `This account already has an active plan, so this purchase has not been linked. Do not pay again - contact hello@gothreadly.live with reference ${claim.id} and the purchase will be reviewed.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const t = await transitionClaim(claim.id, ["paid_unclaimed"], () => ({ status: "claimed", claimedBy: access.workspaceUid, claimedAt: now.toISOString() }));
    if (!t.applied) {
      // The grant is committed; the claim marker must converge. A concurrent
      // claimer of THIS claim is impossible (single secret holder), so an
      // abort means a prior attempt already marked it after granting - reload
      // and confirm the consistent state instead of failing.
      const after = await loadClaim(claim.id);
      if (!after || after.status !== "claimed") {
        console.error(`claim ${claim.id}: billing granted but claim marker not applied`);
      }
    }
    await inWorkspace(access, () => savePlan(claim.plan));
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
