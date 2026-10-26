import type { BillingProvider } from "./store";
import type { BillingInterval, RazorpayPlanId } from "./dodo";

export type AttemptState = "pending" | "issued" | "uncertain" | "failed" | "expired" | "reconciled";

export interface CheckoutAttempt {
  id: string;
  provider: BillingProvider;
  plan: RazorpayPlanId;
  interval: BillingInterval;
  state: AttemptState;
  checkoutUrl: string | null;
  providerRef: string | null; // dodo checkout session id / razorpay order id
  amount?: number | null; // server-priced order amount in subunits (razorpay)
  currency?: string | null;
  upgradeOf?: string | null; // previous razorpay order id when this is an upgrade
  createdAt: string;
  updatedAt: string;
}

// How long an unresolved attempt blocks new attempts. Dodo: checkout sessions
// expire after 24 hours by default (docs: developer-resources/checkout-session).
// Razorpay: no published short_url lifetime - same conservative 24h window.
export const ATTEMPT_EXPIRY_MS: Record<BillingProvider, number> = {
  dodo: 24 * 60 * 60 * 1000,
  razorpay: 24 * 60 * 60 * 1000,
};

export type AttemptVerdict =
  | { open: true }
  | { open: false; state: AttemptState; checkoutUrl: string | null };

/** One durable attempt per workspace: an unresolved attempt blocks any new one. */
export function evaluateAttempt(existing: CheckoutAttempt | null, now: Date): AttemptVerdict {
  if (!existing) return { open: true };
  if (existing.state === "failed" || existing.state === "expired" || existing.state === "reconciled") return { open: true };
  const age = now.getTime() - Date.parse(existing.createdAt);
  if (age > ATTEMPT_EXPIRY_MS[existing.provider]) return { open: true };
  return { open: false, state: existing.state, checkoutUrl: existing.checkoutUrl };
}
