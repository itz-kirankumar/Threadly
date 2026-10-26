import { createHash, randomBytes } from "crypto";
import type { BillingInterval, PaidPlanId } from "./dodo";
import { getAdminDatabase } from "@/lib/geo/admin-store";

// Guest checkout claim: a payment is bound to a durable claim record. The
// claim secret (returned once at order creation, carried in the claim URL) is
// the proof of purchase authority - a verified sign-in ALONE never grants a
// claim, and the email typed at checkout is a signal, never proof.
export type ClaimStatus = "pending" | "paid_unclaimed" | "claimed" | "uncertain" | "expired";

export interface BillingClaim {
  id: string;
  provider: "razorpay";
  plan: PaidPlanId;
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
  const db = await getAdminDatabase();
  if (!db) throw new Error("Database unavailable");
  await db.ref(`${CLAIMS_ROOT}/${claim.id}`).set(claim);
}

export async function loadClaim(id: string): Promise<BillingClaim | null> {
  const db = await getAdminDatabase();
  if (!db) throw new Error("Database unavailable");
  const snap = await db.ref(`${CLAIMS_ROOT}/${id}`).get();
  return snap.exists() ? (snap.val() as BillingClaim) : null;
}

export async function loadClaimByOrder(orderId: string): Promise<BillingClaim | null> {
  const db = await getAdminDatabase();
  if (!db) throw new Error("Database unavailable");
  const snap = await db.ref(CLAIMS_ROOT).orderByChild("orderId").equalTo(orderId).limitToFirst(1).get();
  if (!snap.exists()) return null;
  return Object.values(snap.val() as Record<string, BillingClaim>)[0] ?? null;
}

// Atomic status transition: exactly one caller can move a claim out of an
// expected state (claim-once, no double entitlement).
export async function transitionClaim(
  id: string,
  from: ClaimStatus[],
  mutate: (claim: BillingClaim) => Partial<BillingClaim>,
): Promise<{ applied: boolean; claim: BillingClaim | null }> {
  const db = await getAdminDatabase();
  if (!db) throw new Error("Database unavailable");
  const ref = db.ref(`${CLAIMS_ROOT}/${id}`);
  const result = await ref.transaction((current: BillingClaim | null) => {
    if (!current || !from.includes(current.status)) return undefined; // abort
    if (current.status !== "claimed" && Date.now() - Date.parse(current.createdAt) > CLAIM_EXPIRY_MS) {
      return { ...current, status: "expired", updatedAt: new Date().toISOString() };
    }
    return { ...current, ...mutate(current), updatedAt: new Date().toISOString() };
  });
  return { applied: result.committed, claim: (result.snapshot.val() as BillingClaim) ?? null };
}
