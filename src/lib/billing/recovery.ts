import type { CheckoutAttempt } from "./attempt";

// Same-provider recovery after ambiguous checkout creation. Never switches
// provider; never treats a lost response as "nothing was created".

export type RazorpayOrderLite = { id: string; status?: string | null };

export type RazorpayBlockedAction =
  | { action: "resume"; orderId: string }
  | { action: "mark_reconciled_paid" }
  | { action: "mark_failed_allow_new" }
  | { action: "keep_blocked" };

// An order linked to the attempt's receipt is resumed, never duplicated.
// Absence from the orders list is trusted only when the attempt is old enough
// to outlive provider listing delays AND two independent reads agreed; anything
// else stays blocked (fail closed). An orphan order that escaped detection can
// never reach the customer: Standard Checkout only opens with the order id we
// return, and a lost response never surfaced one.
export function decideRazorpayBlockedAction(params: {
  existing: CheckoutAttempt;
  now: Date;
  orders: RazorpayOrderLite[] | null; // null = listing failed -> unknown
  readsAgree: boolean;
  minAgeMs?: number;
}): RazorpayBlockedAction {
  const { existing, now, orders, readsAgree } = params;
  if (orders === null) return { action: "keep_blocked" };
  const open = orders.filter((o) => o.status === "created" || o.status === "attempted");
  if (open.length > 0) return { action: "resume", orderId: open[0].id };
  if (orders.some((o) => o.status === "paid")) return { action: "mark_reconciled_paid" };
  const ageMs = now.getTime() - Date.parse(existing.createdAt);
  if (readsAgree && ageMs > (params.minAgeMs ?? 5 * 60 * 1000)) return { action: "mark_failed_allow_new" };
  return { action: "keep_blocked" };
}

export type DodoBlockedAction =
  | { action: "allow_new" }
  | { action: "mark_reconciled_paid" }
  | { action: "keep_blocked" };

// A Dodo checkout session expires after its TTL (24h default per Dodo docs:
// developer-resources/checkout-session) and its link is single-use. A fresh
// session is allowed only after the TTL AND a clean payments lookup for the
// workspace; a payment found (incl. late settlement) reconciles instead; any
// lookup failure stays blocked.
export function decideDodoBlockedAction(params: {
  existing: CheckoutAttempt;
  now: Date;
  paymentFound: boolean | null; // null = payments lookup failed -> unknown
  sessionTtlMs?: number;
}): DodoBlockedAction {
  const { existing, now, paymentFound } = params;
  if (paymentFound === true) return { action: "mark_reconciled_paid" };
  const ageMs = now.getTime() - Date.parse(existing.createdAt);
  if (paymentFound === false && ageMs > (params.sessionTtlMs ?? 24 * 60 * 60 * 1000)) return { action: "allow_new" };
  return { action: "keep_blocked" };
}
