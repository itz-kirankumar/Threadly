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

// ---- promo identity reservations (verified identity, lease + fencing) ----
// One promo per verified email / verified phone, enforced atomically across
// accounts. Keys derive from the VERIFIED claimant identity (never from
// unauthenticated redeem input). Each reservation is a LEASE with a fencing
// token:
//  - an unexpired lease is honored absolutely: no reclaim while the owner
//    could still be mid-grant (paid_unclaimed is the normal in-flight state);
//  - reclaim requires an EXPIRED lease plus billing/claim truth showing the
//    grant never committed, and is a compare-and-swap on claimId + fence;
//  - the claimant atomically re-validates fence and EXTENDS the lease
//    immediately before the billing grant, so it never grants on a stale
//    lease - a reclaimer can only win a truly expired lease, and transactions
//    on the node serialize, so exactly one side proceeds;
//  - after the grant commits, the reservation is marked committed: permanent
//    consumption, unaffected by later term end or billing changes.
const PROMO_ID_ROOT = "geo/promoIdentities";
export const PROMO_LEASE_MS = 10 * 60 * 1000;

export interface PromoReservation {
  claimId: string;
  uid: string;
  fence: number;
  leaseUntil: string;
  committed?: boolean;
  at: string;
}

export type ReserveTransition =
  | { action: "create" | "refresh"; value: PromoReservation }
  | { action: "yours"; value: PromoReservation }
  | { action: "taken"; value: PromoReservation };

/** Fresh reservation attempt. Ours => lease refreshed (same fence). */
export function reserveTransition(
  current: PromoReservation | null,
  claimId: string,
  uid: string,
  now: Date,
): ReserveTransition {
  if (!current) {
    return { action: "create", value: { claimId, uid, fence: 1, leaseUntil: new Date(now.getTime() + PROMO_LEASE_MS).toISOString(), at: now.toISOString() } };
  }
  if (current.claimId === claimId) {
    return { action: "refresh", value: { ...current, leaseUntil: new Date(now.getTime() + PROMO_LEASE_MS).toISOString() } };
  }
  return { action: "yours", value: current };
}

/** Atomic fence re-check + lease extension immediately before the grant. The
 * claimant grants only while this succeeds, so it never grants on a lease a
 * reclaimer could have taken. */
export function renewTransition(
  current: PromoReservation | null,
  claimId: string,
  fence: number,
  now: Date,
): { ok: true; value: PromoReservation } | { ok: false } {
  if (!current || current.claimId !== claimId || current.fence !== fence || current.committed) return { ok: false };
  return { ok: true, value: { ...current, leaseUntil: new Date(now.getTime() + PROMO_LEASE_MS).toISOString() } };
}

/** Truth check on an EXPIRED reservation's owner. Consumed is permanent: a
 * claimed marker, a committed flag, or a billing record still carrying the
 * claim's grant. Term end or later billing changes never unconsumes. */
export function classifyReservationOwner(
  reservation: PromoReservation,
  claim: { status?: string } | null,
  billing: { claimId?: string | null; status?: string } | null,
): "orphan" | "consumed" {
  if (reservation.committed) return "consumed";
  if (claim?.status === "claimed") return "consumed";
  if (billing && billing.claimId === reservation.claimId && (billing.status === "active" || billing.status === "grace" || billing.status === "ended")) {
    return "consumed"; // a grant from this claim existed; consumption survives term end
  }
  return "orphan";
}

/** CAS reclaim of an expired orphan lease. All conditions re-checked INSIDE
 * the transaction on the current value - never trust the earlier read. */
export function reclaimTransition(
  current: PromoReservation | null,
  expected: { claimId: string; fence: number },
  next: { claimId: string; uid: string },
  now: Date,
): { action: "reclaim"; value: PromoReservation } | { action: "busy" } {
  if (!current) return { action: "busy" };
  if (current.claimId !== expected.claimId || current.fence !== expected.fence) return { action: "busy" };
  if (current.committed) return { action: "busy" };
  if (Date.parse(current.leaseUntil) >= now.getTime()) return { action: "busy" }; // lease still honored
  return {
    action: "reclaim",
    value: { claimId: next.claimId, uid: next.uid, fence: current.fence + 1, leaseUntil: new Date(now.getTime() + PROMO_LEASE_MS).toISOString(), at: now.toISOString() },
  };
}

/** Mark a reservation permanently consumed after the grant commits. */
export function commitTransition(current: PromoReservation | null, claimId: string, fence: number): PromoReservation | undefined {
  if (!current || current.claimId !== claimId || current.fence !== fence) return undefined; // abort
  return { ...current, committed: true };
}

function promoIdentityKey(kind: "email" | "phone", value: string): string {
  return `${kind}_${createHash("sha256").update(`threadly-promo:${kind}:${value}`).digest("hex")}`;
}

async function promoRef(kind: "email" | "phone", value: string) {
  return (await db()).ref(`${PROMO_ID_ROOT}/${promoIdentityKey(kind, value)}`);
}

export type ReserveResult = { outcome: "held"; fence: number } | { outcome: "taken" };

/** Reserve (or re-enter) the promo identity lease, reclaiming expired
 * orphans only after billing/claim truth shows the grant never committed. */
export async function reservePromoIdentity(kind: "email" | "phone", value: string, claimId: string, uid: string): Promise<ReserveResult> {
  const ref = await promoRef(kind, value);
  let held: PromoReservation | null = null;
  let taken: PromoReservation | null = null;
  await ref.transaction((current: PromoReservation | null) => {
    const t = reserveTransition(current, claimId, uid, new Date());
    if (t.action === "taken") {
      taken = t.value;
      return undefined; // abort
    }
    held = t.value;
    return t.value;
  });
  const heldVal = held as PromoReservation | null;
  if (heldVal) return { outcome: "held", fence: heldVal.fence };
  const takenVal = taken as PromoReservation | null;
  if (!takenVal) return { outcome: "taken" };
  const owner: PromoReservation = takenVal;
  if (owner.committed) return { outcome: "taken" };
  if (Date.parse(owner.leaseUntil) >= Date.now()) return { outcome: "taken" }; // lease honored: owner may be mid-grant
  const [ownerClaim, ownerBilling] = await Promise.all([
    loadClaim(owner.claimId).catch(() => null),
    (await db()).ref(`users/${owner.uid}/geo/billing`).get().then((b) => b.val() as { claimId?: string | null; status?: string } | null).catch(() => null),
  ]);
  if (classifyReservationOwner(owner, ownerClaim, ownerBilling) === "consumed") return { outcome: "taken" };
  let reclaimed: PromoReservation | null = null;
  await ref.transaction((current: PromoReservation | null) => {
    const d = reclaimTransition(current, { claimId: owner.claimId, fence: owner.fence }, { claimId, uid }, new Date());
    if (d.action === "reclaim") {
      reclaimed = d.value;
      return d.value;
    }
    return undefined; // abort: value moved under us
  });
  const reclaimedVal = reclaimed as PromoReservation | null;
  return reclaimedVal ? { outcome: "held", fence: reclaimedVal.fence } : { outcome: "taken" };
}

/** Atomic fence + lease re-validation immediately before the billing grant. */
export async function renewPromoIdentity(kind: "email" | "phone", value: string, claimId: string, fence: number): Promise<boolean> {
  const ref = await promoRef(kind, value);
  let ok = false;
  const tx = await ref.transaction((current: PromoReservation | null) => {
    const t = renewTransition(current, claimId, fence, new Date());
    if (t.ok) {
      ok = true;
      return t.value;
    }
    return undefined;
  });
  return tx.committed && ok;
}

/** Permanent consumption marker, written after the grant commits. */
export async function commitPromoIdentity(kind: "email" | "phone", value: string, claimId: string, fence: number): Promise<void> {
  const ref = await promoRef(kind, value);
  await ref.transaction((current: PromoReservation | null) => commitTransition(current, claimId, fence));
}
