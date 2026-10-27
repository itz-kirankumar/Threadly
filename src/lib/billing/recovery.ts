import type { CheckoutAttempt } from "./attempt";

// Same-provider recovery after ambiguous checkout creation. Never switches
// provider; never treats a lost response as "nothing was created".

export type RazorpayOrderLite = { id: string; status?: string | null };

export type RazorpayBlockedAction =
  | { action: "resume"; orderId: string }
  | { action: "mark_reconciled_paid" }
  | { action: "keep_blocked" };

// Only UNAMBIGUOUS outcomes proceed: an open order on the attempt's receipt is
// resumed (never duplicated), a paid order reconciles. Every other case -
// including an empty listing - stays blocked: provider listing lag or a create
// completing server-side after a lost response means absence is never proof of
// no-resource. Frozen until an owning source establishes terminality.
export function decideRazorpayBlockedAction(params: {
  existing: CheckoutAttempt;
  now: Date;
  orders: RazorpayOrderLite[] | null; // null = listing failed -> unknown
  readsAgree: boolean; // retained for call-site clarity; absence never unblocks
}): RazorpayBlockedAction {
  const { existing, now, orders, readsAgree } = params;
  if (orders === null) return { action: "keep_blocked" };
  const open = orders.filter((o) => o.status === "created" || o.status === "attempted");
  // Resume only a unique open order; multiple matches are ambiguous.
  if (open.length === 1) return { action: "resume", orderId: open[0].id };
  if (open.length > 1) return { action: "keep_blocked" };
  if (orders.some((o) => o.status === "paid")) return { action: "mark_reconciled_paid" };
  return { action: "keep_blocked" };
}

export type DodoBlockedAction =
  | { action: "mark_reconciled_paid" }
  | { action: "keep_blocked" };

// A payment found for the workspace reconciles. Everything else stays blocked:
// session TTL plus a clean payments list does not prove a session-created
// payment/subscription is terminal or that listing is eventually consistent.
// Frozen until an owning source establishes terminality.
export function decideDodoBlockedAction(params: {
  existing: CheckoutAttempt;
  now: Date;
  paymentFound: boolean | null; // null = payments lookup failed -> unknown
  sessionTtlMs?: number;
}): DodoBlockedAction {
  const { existing, now, paymentFound } = params;
  if (paymentFound === true) return { action: "mark_reconciled_paid" };
  return { action: "keep_blocked" };
}
