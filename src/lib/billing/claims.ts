import { createHash, randomBytes } from "crypto";
import type { BillingInterval, RazorpayPlanId } from "./dodo";
import type { BillingProvider } from "./store";
async function db() {
  const { getAdminDatabase } = await import("@/lib/geo/admin-store");
  const database = await getAdminDatabase();
  if (!database) throw new Error("Database unavailable");
  return database;
}

// Guest checkout claim: a payment is bound to a durable claim record. The
// claim secret (returned once at order creation, carried in the claim URL) is
// the proof of purchase authority - a verified sign-in ALONE never grants a
// claim, and the email typed at checkout is a signal, never proof.
export type ClaimStatus = "pending" | "paid_unclaimed" | "claimed" | "uncertain" | "expired";

export interface BillingClaim {
  id: string;
  provider: BillingProvider;
  plan: RazorpayPlanId;
  interval: BillingInterval;
  amount: number;
  currency: string;
  orderId: string;
  paymentId: string | null;
  status: ClaimStatus;
  claimTokenHash: string;
  checkoutEmail: string | null;
  checkoutContact: string | null; // phone collected at checkout (signal, not proof)
  claimedBy: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CLAIMS_ROOT = "geo/billingClaims";
const CLAIM_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // unclaimed claims lapse after 7 days

export function newClaimSecret(): { secret: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  return { secret, hash: hashClaimSecret(secret) };
}

export function hashClaimSecret(secret: string): string {
  return createHash("sha256").update(`threadly-claim:${secret}`).digest("hex");
}

export async function saveClaim(claim: BillingClaim): Promise<void> {
  await (await db()).ref(`${CLAIMS_ROOT}/${claim.id}`).set(claim);
}

export async function loadClaim(id: string): Promise<BillingClaim | null> {
  const snap = await (await db()).ref(`${CLAIMS_ROOT}/${id}`).get();
  return snap.exists() ? (snap.val() as BillingClaim) : null;
}

export async function loadClaimByOrder(orderId: string): Promise<BillingClaim | null> {
  const snap = await (await db()).ref(CLAIMS_ROOT).orderByChild("orderId").equalTo(orderId).limitToFirst(1).get();
  if (!snap.exists()) return null;
  return Object.values(snap.val() as Record<string, BillingClaim>)[0] ?? null;
}

// Pure transition decision, unit-tested: the RTDB transaction applies exactly
// this logic, so concurrency/replay/interruption behavior is provable offline.
export function decideClaimTransition(
  current: BillingClaim | null,
  from: ClaimStatus[],
  now: Date,
): "abort" | "expire" | "apply" {
  if (!current || !from.includes(current.status)) return "abort";
  if (current.status !== "claimed" && now.getTime() - Date.parse(current.createdAt) > CLAIM_EXPIRY_MS) return "expire";
  return "apply";
}

// Atomic status transition: exactly one caller can move a claim out of an
// expected state (claim-once, no double entitlement).
export async function transitionClaim(
  id: string,
  from: ClaimStatus[],
  mutate: (claim: BillingClaim) => Partial<BillingClaim>,
): Promise<{ applied: boolean; claim: BillingClaim | null }> {
  const ref = (await db()).ref(`${CLAIMS_ROOT}/${id}`);
  const result = await ref.transaction((current: BillingClaim | null) => {
    const verdict = decideClaimTransition(current, from, new Date());
    if (verdict === "abort") return undefined;
    if (verdict === "expire" || !current) {
      return current ? { ...current, status: "expired", updatedAt: new Date().toISOString() } : undefined;
    }
    return { ...current, ...mutate(current), updatedAt: new Date().toISOString() };
  });
  return { applied: result.committed, claim: (result.snapshot.val() as BillingClaim) ?? null };
}

export interface ClaimPaymentView {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  order_id?: string;
  email?: string | null;
  contact?: string | null;
}

export type ClaimReconcileDecision =
  | { action: "mark_paid"; paymentId: string; email: string | null; contact: string | null }
  | { action: "pause_mismatch" }
  | { action: "none" };

// Pure reconcile decision, unit-tested: a claim only advances from PROVIDER
// evidence (order paid + a captured payment of the exact price
// bound to the same order). Anything short of that changes nothing - an
// unpaid order keeps the claim pending; a wrong amount pauses it for review.
export function decideClaimReconcile(
  claim: BillingClaim,
  order: { status?: string } | null,
  payment: ClaimPaymentView | null,
): ClaimReconcileDecision {
  if (claim.status !== "pending") return { action: "none" };
  if (!order || order.status !== "paid") return { action: "none" };
  // Only "captured" counts: an authorized-but-uncaptured payment can still
  // be reversed, so it must never feed an entitlement grant.
  if (!payment || payment.status !== "captured") return { action: "none" };
  if (payment.order_id !== claim.orderId) return { action: "none" };
  if (payment.amount !== claim.amount || payment.currency !== claim.currency) return { action: "pause_mismatch" };
  return {
    action: "mark_paid",
    paymentId: payment.id as string,
    email: payment.email ?? null,
    contact: payment.contact ?? null,
  };
}

// Refresh a pending claim against Razorpay. Returns the resulting status.
// Provider errors propagate so callers decide: the claim page ignores them
// (buyer keeps the honest "pending" state), the cron sweep counts them.
export async function reconcileClaimWithProvider(claim: BillingClaim): Promise<ClaimStatus> {
  if (claim.status !== "pending" || claim.provider !== "razorpay") return claim.status;
  // Dynamic import: keeps this module free of runtime provider deps so the
  // pure decisions above stay loadable (and testable) in isolation.
  const { razorpayFetchOrder, razorpayFetchOrderPayments } = await import("./razorpay");
  const order = await razorpayFetchOrder(claim.orderId);
  if (order.status !== "paid") return claim.status;
  const payments = await razorpayFetchOrderPayments(claim.orderId);
  const payment = payments.find((p) => p.status === "captured") ?? null;
  const decision = decideClaimReconcile(claim, order, payment);
  if (decision.action === "none") return claim.status;
  const t = await transitionClaim(claim.id, ["pending"], () =>
    decision.action === "mark_paid"
      ? { status: "paid_unclaimed" as const, paymentId: decision.paymentId, checkoutEmail: decision.email, checkoutContact: decision.contact }
      : { status: "uncertain" as const },
  );
  return t.claim?.status ?? claim.status;
}

// Pending claims for the reconciliation sweep (bounded).
async function listAllClaims(): Promise<BillingClaim[]> {
  // Plain read + in-code filter: orderByChild would require an RTDB .indexOn
  // rules deploy we cannot make from here, and the claims set is small.
  const snap = await (await db()).ref(CLAIMS_ROOT).get();
  if (!snap.exists()) return [];
  return Object.values(snap.val() as Record<string, BillingClaim>);
}

export async function listOpenClaims(limit = 25): Promise<BillingClaim[]> {
  return (await listAllClaims()).filter((c) => c.status === "pending").slice(0, limit);
}

export async function listPromoClaims(): Promise<BillingClaim[]> {
  return (await listAllClaims()).filter((c) => c.provider === "promo");
}

// ---- promo identity reservations (verified identity, transaction-safe) ----
// One promo per verified email / verified phone, enforced atomically across
// accounts: the key is derived from the VERIFIED claimant identity (never
// from unauthenticated redeem input) and the value binds the claim that owns
// the reservation, so retries and partial-attach recovery are idempotent.
const PROMO_ID_ROOT = "geo/promoIdentities";

export type ReservationTransition =
  | { action: "reserve"; value: { claimId: string; uid: string; at: string } }
  | { action: "yours" }
  | { action: "taken" };

export function reservationTransition(
  current: { claimId?: string } | null,
  claimId: string,
  uid: string,
  now: Date = new Date(),
): ReservationTransition {
  if (!current) return { action: "reserve", value: { claimId, uid, at: now.toISOString() } };
  if (current.claimId === claimId) return { action: "yours" };
  return { action: "taken" };
}

function promoIdentityKey(kind: "email" | "phone", value: string): string {
  return `${kind}_${createHash("sha256").update(`threadly-promo:${kind}:${value}`).digest("hex")}`;
}

export async function reservePromoIdentity(
  kind: "email" | "phone",
  value: string,
  claimId: string,
  uid: string,
): Promise<"reserved" | "yours" | "taken"> {
  const ref = (await db()).ref(`${PROMO_ID_ROOT}/${promoIdentityKey(kind, value)}`);
  let outcome: "reserved" | "yours" | "taken" = "taken";
  await ref.transaction((current) => {
    const t = reservationTransition(current, claimId, uid);
    outcome = t.action === "reserve" ? "reserved" : t.action;
    return t.action === "reserve" ? t.value : undefined;
  });
  if (outcome !== "taken") return outcome;
  // Taken: verify the owner against billing/claim truth before giving up.
  // An orphaned reservation (claim abandoned, expired, or never committed)
  // is reclaimed atomically; a genuinely consumed identity stays taken.
  const snap = await ref.get();
  const current = snap.val() as { claimId?: string; uid?: string } | null;
  if (!current?.claimId || !current.uid) return "taken"; // raced: someone else just moved it
  const [ownerClaim, ownerBilling] = await Promise.all([
    loadClaim(current.claimId).catch(() => null),
    (await db()).ref(`users/${current.uid}/geo/billing`).get().then((b) => b.val() as { claimId?: string | null; status?: string } | null).catch(() => null),
  ]);
  if (classifyReservationOwner(ownerClaim, ownerBilling, current.claimId) === "consumed") return "taken";
  let reclaimed = false;
  await ref.transaction((latest) => {
    const d = reclaimDecision(latest, current.claimId as string, { claimId, uid, at: new Date().toISOString() });
    reclaimed = d.action === "reclaim";
    return d.action === "reclaim" ? d.value : undefined;
  });
  return reclaimed ? "reserved" : "taken";
}

/** Truth check on a reservation's owner: is the identity really consumed?
 * Consumed ONLY when the granting claim is marked claimed or the owner's
 * workspace billing still carries that claim's active grant. An expired,
 * unclaimed, or never-committed reservation is an orphan and may be
 * reclaimed - a committed/consumed identity is never released. */
export function classifyReservationOwner(
  claim: { status?: string } | null,
  billing: { claimId?: string | null; status?: string } | null,
  ownerClaimId: string,
): "orphan" | "consumed" {
  if (claim?.status === "claimed") return "consumed";
  if (billing && billing.claimId === ownerClaimId && (billing.status === "active" || billing.status === "grace")) {
    return "consumed";
  }
  return "orphan";
}

/** Reclaim decision applied inside the reservation transaction: replace the
 * value only if it is still the exact orphan we verified - a concurrent
 * reclaim or a fresh reservation by someone else must not be clobbered. */
export function reclaimDecision(
  current: { claimId?: string } | null,
  expectedOrphanClaimId: string,
  next: { claimId: string; uid: string; at: string },
): { action: "reclaim"; value: typeof next } | { action: "busy" } {
  if (current && current.claimId === expectedOrphanClaimId) return { action: "reclaim", value: next };
  return { action: "busy" };
}

/** Best-effort release of OUR reservation only (claimId must match), used
 * when a grant aborts after reserving so eligibility is not leaked. */
export async function releasePromoIdentity(kind: "email" | "phone", value: string, claimId: string): Promise<void> {
  const ref = (await db()).ref(`${PROMO_ID_ROOT}/${promoIdentityKey(kind, value)}`);
  await ref.transaction((current) => (current && current.claimId === claimId ? null : undefined));
}
