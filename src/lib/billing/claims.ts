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

// ---- promo identity consumption (single atomic boundary) ----
// ALL promo identity coordination runs in transactions on ONE node -
// geo/promoIdentities, the common ancestor of the email and phone keys - so
// the pair is read and written atomically and every promo claimant serializes
// on the same boundary. Consumption (committed=true on both keys) is THE
// grant boundary: the billing write happens ONLY after a successful consume
// transaction. A claimant that paused past its lease and lost ownership fails
// its consume transaction (claimId/fence mismatch) BEFORE any billing write -
// stale grants are impossible. Committed consumption is permanent: term end
// and later billing changes never unconsume. If the billing guard then
// aborts (existing plan), the consumption rolls back - it granted nothing,
// so this is not releasing a consumed identity.
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
export type PromoIdMap = Record<string, PromoReservation>;
export type PromoKeys = { emailKey: string; phoneKey: string };

export type ReserveAllResult =
  | { action: "held"; map: PromoIdMap; fence: number }
  | { action: "consumed-by-me"; fence: number }
  | { action: "taken"; map: PromoIdMap; blockingKeys: string[] };

/** Reserve both identity keys atomically. Idempotent for the same claim
 * (lease refresh, fence kept). */
export function reserveAllTransition(
  map: PromoIdMap | null,
  keys: PromoKeys,
  claimId: string,
  uid: string,
  now: Date,
): ReserveAllResult {
  const m = map ?? {};
  const e = m[keys.emailKey];
  const p = m[keys.phoneKey];
  const mineE = e?.claimId === claimId;
  const mineP = p?.claimId === claimId;
  if (mineE && mineP && e?.committed && p?.committed) {
    return { action: "consumed-by-me", fence: e.fence };
  }
  const blocking: string[] = [];
  if (e && !mineE) blocking.push(keys.emailKey);
  if (p && !mineP) blocking.push(keys.phoneKey);
  if (blocking.length) return { action: "taken", map: m, blockingKeys: blocking };
  const fence = e?.fence ?? p?.fence ?? 1;
  const leaseUntil = new Date(now.getTime() + PROMO_LEASE_MS).toISOString();
  const next: PromoIdMap = { ...m };
  next[keys.emailKey] = { claimId, uid, fence, leaseUntil, at: e?.at ?? now.toISOString(), ...(e?.committed ? { committed: true } : {}) };
  next[keys.phoneKey] = { claimId, uid, fence, leaseUntil, at: p?.at ?? now.toISOString(), ...(p?.committed ? { committed: true } : {}) };
  return { action: "held", map: next, fence };
}

/** THE grant boundary. Atomically: both keys owned by this claim with equal
 * fences -> both committed. Ownership loss (reclaim bumped claimId/fence)
 * fails HERE, before any billing write, so a stale claimant cannot grant.
 * Idempotent when already committed by this claim. */
export function consumeAllTransition(
  map: PromoIdMap | null,
  keys: PromoKeys,
  claimId: string,
): { ok: true; map: PromoIdMap; already: boolean } | { ok: false } {
  const m = map ?? {};
  const e = m[keys.emailKey];
  const p = m[keys.phoneKey];
  if (!e || !p) return { ok: false };
  if (e.claimId !== claimId || p.claimId !== claimId) return { ok: false };
  if (e.fence !== p.fence) return { ok: false };
  if (e.committed && p.committed) return { ok: true, map: m, already: true };
  if (e.committed || p.committed) return { ok: false };
  return {
    ok: true,
    already: false,
    map: {
      ...m,
      [keys.emailKey]: { ...e, committed: true },
      [keys.phoneKey]: { ...p, committed: true },
    },
  };
}

/** Roll back OUR consumption after the billing guard aborts - it granted
 * nothing, so no consumed identity is released. Only touches keys still
 * bound to this exact claim + fence. */
export function rollbackAllTransition(
  map: PromoIdMap | null,
  keys: PromoKeys,
  claimId: string,
  fence: number,
): PromoIdMap | undefined {
  const m = map ?? {};
  const e = m[keys.emailKey];
  const p = m[keys.phoneKey];
  if (!e || !p || e.claimId !== claimId || p.claimId !== claimId) return undefined;
  if (e.fence !== fence || p.fence !== fence) return undefined;
  const next: PromoIdMap = { ...m };
  delete next[keys.emailKey];
  delete next[keys.phoneKey];
  return next;
}

/** Reclaim expired, never-committed reservations after an outside truth
 * check. Every observed fact is re-verified inside the transaction. */
export function reclaimAllTransition(
  map: PromoIdMap | null,
  keys: PromoKeys,
  expected: PromoIdMap,
  next: { claimId: string; uid: string },
  now: Date,
): { action: "reclaim"; map: PromoIdMap } | { action: "busy" } {
  const m = map ?? {};
  for (const key of [keys.emailKey, keys.phoneKey]) {
    const cur = m[key];
    const exp = expected[key];
    if (!exp) {
      if (cur) return { action: "busy" };
      continue;
    }
    if (!cur) return { action: "busy" };
    if (
      cur.claimId !== exp.claimId ||
      cur.fence !== exp.fence ||
      cur.leaseUntil !== exp.leaseUntil ||
      Boolean(cur.committed) !== Boolean(exp.committed)
    ) {
      return { action: "busy" };
    }
    if (cur.committed) return { action: "busy" };
    if (Date.parse(cur.leaseUntil) >= now.getTime()) return { action: "busy" }; // lease honored absolutely
  }
  const out: PromoIdMap = { ...m };
  const leaseUntil = new Date(now.getTime() + PROMO_LEASE_MS).toISOString();
  for (const key of [keys.emailKey, keys.phoneKey]) {
    out[key] = { claimId: next.claimId, uid: next.uid, fence: (expected[key]?.fence ?? 0) + 1, leaseUntil, at: now.toISOString() };
  }
  return { action: "reclaim", map: out };
}

/** Truth check for a blocking owner. Consumed is permanent: committed flag,
 * claimed marker, or any billing record carrying that claim's grant
 * (active, grace, or ended). */
export function classifyReservationOwner(
  reservation: PromoReservation | undefined,
  claim: { status?: string } | null,
  billing: { claimId?: string | null; status?: string } | null,
): "orphan" | "consumed" {
  if (!reservation) return "orphan";
  if (reservation.committed) return "consumed";
  if (claim?.status === "claimed") return "consumed";
  if (billing && billing.claimId === reservation.claimId && (billing.status === "active" || billing.status === "grace" || billing.status === "ended")) {
    return "consumed";
  }
  return "orphan";
}

export function promoIdentityKey(kind: "email" | "phone", value: string): string {
  return `${kind}_${createHash("sha256").update(`threadly-promo:${kind}:${value}`).digest("hex")}`;
}

export type ConsumeResult =
  | { outcome: "consumed"; fence: number }
  | { outcome: "taken"; blocking: "email" | "phone" | "other" };

/** Claim-route entry point: reserve (or reclaim expired orphans after a
 * truth check), then atomically consume. "consumed" also covers idempotent
 * re-entry after a crash between consumption and billing grant. */
export async function consumePromoIdentities(
  email: string,
  phone: string,
  claimId: string,
  uid: string,
): Promise<ConsumeResult> {
  const keys: PromoKeys = { emailKey: promoIdentityKey("email", email), phoneKey: promoIdentityKey("phone", phone) };
  const ref = (await db()).ref(PROMO_ID_ROOT);
  let state: "held" | "mine" | "taken" = "taken";
  let fence = 0;
  let snapshot: PromoIdMap | null = null;
  let blockingKeys: string[] = [];
  await ref.transaction((current: PromoIdMap | null) => {
    const t = reserveAllTransition(current, keys, claimId, uid, new Date());
    if (t.action === "held") {
      state = "held";
      fence = t.fence;
      return t.map;
    }
    if (t.action === "consumed-by-me") {
      state = "mine";
      fence = t.fence;
      return undefined; // no change needed
    }
    snapshot = t.map;
    blockingKeys = t.blockingKeys;
    return undefined; // abort
  });
  const st = state as "held" | "mine" | "taken";
  const heldFence = fence as number;
  if (st === "mine") return { outcome: "consumed", fence: heldFence };
  if (st === "taken") {
    const snap = snapshot as PromoIdMap | null;
    if (!snap) return { outcome: "taken", blocking: "other" };
    const owners = [...new Set(blockingKeys.map((k) => snap[k]).filter(Boolean))] as PromoReservation[];
    if (owners.some((r) => r.committed) || owners.some((r) => Date.parse(r.leaseUntil) >= Date.now())) {
      return { outcome: "taken", blocking: snap[keys.emailKey] && snap[keys.emailKey].claimId !== claimId ? "email" : "phone" };
    }
    for (const owner of owners) {
      const [ownerClaim, ownerBilling] = await Promise.all([
        loadClaim(owner.claimId).catch(() => null),
        (await db()).ref(`users/${owner.uid}/geo/billing`).get().then((b) => b.val() as { claimId?: string | null; status?: string } | null).catch(() => null),
      ]);
      if (classifyReservationOwner(owner, ownerClaim, ownerBilling) === "consumed") {
        return { outcome: "taken", blocking: snap[keys.emailKey]?.claimId === owner.claimId ? "email" : "phone" };
      }
    }
    let done = false;
    await ref.transaction((current: PromoIdMap | null) => {
      const d = reclaimAllTransition(current, keys, snap, { claimId, uid }, new Date());
      if (d.action === "reclaim") {
        done = true;
        return d.map;
      }
      return undefined;
    });
    if (!done) return { outcome: "taken", blocking: "other" };
  }
  let consumed = false;
  let committedFence = fence;
  await ref.transaction((current: PromoIdMap | null) => {
    const t = consumeAllTransition(current, keys, claimId);
    if (t.ok) {
      consumed = true;
      committedFence = t.map[keys.emailKey].fence;
      return t.map;
    }
    return undefined;
  });
  return consumed ? { outcome: "consumed", fence: committedFence } : { outcome: "taken", blocking: "other" };
}

/** Roll back our own consumption after the billing guard aborted. */
export async function rollbackPromoIdentities(email: string, phone: string, claimId: string, fence: number): Promise<void> {
  const keys: PromoKeys = { emailKey: promoIdentityKey("email", email), phoneKey: promoIdentityKey("phone", phone) };
  await (await db()).ref(PROMO_ID_ROOT).transaction((current: PromoIdMap | null) => rollbackAllTransition(current, keys, claimId, fence));
}
