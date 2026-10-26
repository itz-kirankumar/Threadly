import { errorResponse, readJsonBody } from "@/lib/api-request";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { loadBilling } from "@/lib/billing/store";
import { normalizeE164 } from "@/lib/billing/identity";
import { newClaimSecret, saveClaim, listPromoClaims, type BillingClaim } from "@/lib/billing/claims";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/guest/redeem - promotional code redemption for the 7-day
// trial. A valid code creates a claim directly in paid_unclaimed state - NO
// Razorpay order, no zero-value charge. Ownership is still proven at claim
// time: the typed email + mobile must match the claiming account's verified
// details, exactly like a paid purchase.
export async function POST(request: Request) {
  try {
    const active = process.env.TRIAL_PROMO_CODE;
    if (!active) {
      return Response.json({ error: "This code is not active." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as {
      plan?: unknown; interval?: unknown; email?: unknown; contact?: unknown; promoCode?: unknown;
    };
    if (body.plan !== "trial" || body.interval !== "weekly") {
      return Response.json({ error: "This code applies to the 7-day trial only." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (typeof body.promoCode !== "string" || body.promoCode.trim().toUpperCase() !== active.toUpperCase()) {
      return Response.json({ error: "That code is not valid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const contact = normalizeE164(typeof body.contact === "string" ? body.contact : null);
    if (!contact) {
      return Response.json({ error: "Enter the mobile number with country code (for example +91...)." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    // Mechanical uniqueness, not a marketing limit: one promo claim per set of
    // checkout details, and the active-plan guard below still applies.
    const limit = await checkRateLimit(`redeem:${email}`, 5, 3600);
    if (limit && !limit.allowed) {
      return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "Cache-Control": "no-store" } });
    }
    // Same fail-closed duplicate guard as paid checkout when signed in.
    if ((request.headers.get("authorization") || "").trim()) {
      let identity = null;
      try { identity = await getFirebaseIdentity(request); } catch { identity = null; }
      if (!identity) {
        return Response.json(
          { error: "Your sign-in could not be verified - sign in again, then retry.", code: "reauthenticate" },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      }
      let existing = null;
      try { existing = await withWorkspace(identity.uid, identity.idToken, () => loadBilling()); }
      catch {
        return Response.json(
          { error: "Account status is temporarily unavailable - nothing was redeemed. Try again shortly.", code: "status_unavailable" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      if (existing && (existing.status === "active" || existing.status === "grace")) {
        return Response.json(
          { error: "This account already has an active plan - manage it from billing settings instead.", code: "active_plan" },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    // Any prior promo claim with the same details - pending, unclaimed, or
    // already claimed - blocks a repeat redemption.
    const existing = await listPromoClaims();
    const clash = existing.find(
      (c) =>
        (c.checkoutEmail || "").toLowerCase() === email || normalizeE164(c.checkoutContact) === contact,
    );
    if (clash) {
      return Response.json(
        { error: "This code has already been used with these details. If that was you, continue from the claim link you received." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const now = new Date();
    const { secret, hash } = newClaimSecret();
    const claim: BillingClaim = {
      id: `clm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      provider: "promo",
      plan: "trial",
      interval: "weekly",
      amount: 0,
      currency: "USD",
      orderId: `promo_${active.toUpperCase()}`,
      paymentId: null,
      status: "paid_unclaimed",
      claimTokenHash: hash,
      checkoutEmail: email,
      checkoutContact: contact,
      claimedBy: null,
      claimedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await saveClaim(claim);
    return Response.json(
      { claimId: claim.id, claimSecret: secret, plan: "trial", redeemed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Guest redeem");
  }
}
