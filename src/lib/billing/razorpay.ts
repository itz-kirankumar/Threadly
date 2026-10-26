import crypto from "node:crypto";
import type { BillingInterval, PaidPlanId } from "./dodo";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

// Provider-specific mode, DERIVED FROM THE KEY ITSELF (never from another
// provider's env): test keys can only run test charges. Live keys alone do
// NOT enable charging - live operation additionally requires the explicit
// RAZORPAY_LIVE_ENABLED=true gate, so a live key deployed by accident fails
// closed instead of silently charging real cards.
export function razorpayKeyMode(): "test" | "live" | null {
  const id = process.env.RAZORPAY_KEY_ID ?? "";
  if (id.startsWith("rzp_test_")) return "test";
  if (id.startsWith("rzp_live_")) return "live";
  return null;
}

export function razorpayTestMode(): boolean {
  return razorpayKeyMode() === "test";
}

export function razorpayLiveEnabled(): boolean {
  return razorpayKeyMode() === "live" && process.env.RAZORPAY_LIVE_ENABLED === "true";
}

/** Configured AND allowed to create orders right now. */
export function razorpayOperational(): boolean {
  return razorpayConfigured() && (razorpayTestMode() || razorpayLiveEnabled());
}

/** Test mode limits checkout to the allowlist; gated live mode is open. */
export function razorpayCheckoutAllowed(email: string | null | undefined): boolean {
  if (razorpayLiveEnabled()) return true;
  if (!razorpayTestMode()) return false;
  const allowed = (process.env.BILLING_TEST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && allowed.includes(email!.toLowerCase());
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

const PLAN_ENV: Record<PaidPlanId, Record<BillingInterval, string>> = {
  pro: { monthly: "RAZORPAY_PLAN_PRO_MONTHLY", annual: "RAZORPAY_PLAN_PRO_ANNUAL" },
  growth: { monthly: "RAZORPAY_PLAN_GROWTH_MONTHLY", annual: "RAZORPAY_PLAN_GROWTH_ANNUAL" },
};

export function razorpayPlanFor(plan: PaidPlanId, interval: BillingInterval): string {
  const id = process.env[PLAN_ENV[plan][interval]];
  if (!id) throw new Error("Razorpay plans are not configured on this deployment.");
  return id;
}

export function razorpayPlanFromPlanId(planId: string | null | undefined): PaidPlanId | null {
  if (!planId) return null;
  for (const plan of ["pro", "growth"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (process.env[PLAN_ENV[plan][interval]] === planId) return plan;
    }
  }
  return null;
}

export interface RazorpaySubscription {
  id: string;
  short_url?: string;
  status?: string;
  plan_id?: string;
  customer_id?: string;
}

export async function razorpayCreateSubscription(params: {
  plan: PaidPlanId;
  interval: BillingInterval;
  email: string;
  workspaceUid: string;
}): Promise<RazorpaySubscription> {
  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      plan_id: razorpayPlanFor(params.plan, params.interval),
      // Generous cycle cap; cancellations are handled from our side.
      total_count: params.interval === "annual" ? 10 : 120,
      customer_notify: 0,
      notes: {
        workspace_uid: params.workspaceUid,
        plan: params.plan,
        interval: params.interval,
        email: params.email,
      },
      notify_info: { notify_email: params.email },
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const description = (payload as { error?: { description?: string } }).error?.description ?? `Razorpay returned HTTP ${response.status}`;
    throw new Error(description);
  }
  return payload as unknown as RazorpaySubscription;
}

export function verifyRazorpaySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- Standard Web Checkout (one-time orders) ----

// Server-authoritative pricing in the smallest currency unit (cents/paise).
// Mirrors the public pricing page exactly; clients never supply amounts.
export const ORDER_PRICES: Record<PaidPlanId, Record<BillingInterval, { amount: number; currency: string }>> = {
  pro: {
    monthly: { amount: 4900, currency: "USD" },
    annual: { amount: 46800, currency: "USD" },
  },
  growth: {
    monthly: { amount: 14900, currency: "USD" },
    annual: { amount: 142800, currency: "USD" },
  },
};

export function razorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

export async function razorpayCreateOrder(params: {
  plan: PaidPlanId;
  interval: BillingInterval;
  workspaceUid: string;
  email: string;
  amountOverride?: number;
  upgradeOf?: string | null;
}): Promise<{ id: string; amount: number; currency: string }> {
  const price = ORDER_PRICES[params.plan][params.interval];
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      amount: params.amountOverride ?? price.amount,
      currency: price.currency,
      receipt: `ws_${params.workspaceUid.slice(0, 24)}_${Date.now().toString(36)}`,
      notes: {
        workspace_uid: params.workspaceUid,
        plan: params.plan,
        interval: params.interval,
        email: params.email,
        ...(params.upgradeOf ? { upgrade: "1", upgrade_of: params.upgradeOf } : {}),
      },
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const description = (payload as { error?: { description?: string } }).error?.description ?? `Razorpay returned HTTP ${response.status}`;
    const err = new Error(description) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return payload as unknown as { id: string; amount: number; currency: string };
}

export async function razorpayFetchOrder(orderId: string): Promise<{ id: string; amount?: number; currency?: string; status?: string }> {
  const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, { headers: { Authorization: authHeader() }, cache: "no-store" });
  if (!response.ok) throw new Error(`Razorpay order fetch failed (${response.status})`);
  return (await response.json()) as { id: string; amount?: number; currency?: string; status?: string };
}

export async function razorpayFetchPayment(paymentId: string): Promise<{
  id: string;
  email?: string | null;
  contact?: string | null;
  order_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, string>;
}> {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const description = (payload as { error?: { description?: string } }).error?.description ?? `Razorpay returned HTTP ${response.status}`;
    throw new Error(description);
  }
  return payload as never;
}

/** Standard Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Upgrade quote: credit the unused paid time on the current one-time purchase
// (catalog price prorated daily over the recorded term), charge only the
// difference for the SAME remaining term. The term end never moves on upgrade.
export function upgradeQuote(params: {
  currentPlan: PaidPlanId;
  newPlan: PaidPlanId;
  interval: BillingInterval;
  purchasedAt: string; // billing record updatedAt when the purchase was applied
  periodEnd: string;
  paidThisTerm: number; // ACTUAL amount paid toward the current term (subunits)
  now?: Date;
}): { due: number; currency: string; credit: number; newPlanCost: number; remainingDays: number } | null {
  const now = params.now ?? new Date();
  const end = Date.parse(params.periodEnd);
  const start = Date.parse(params.purchasedAt);
  const total = end - start;
  const remaining = end - now.getTime();
  if (!Number.isFinite(total) || total <= 0 || remaining <= 0 || params.paidThisTerm <= 0) return null;
  // Same-plan and lower-catalog-plan changes are never upgrades, whatever the
  // paid basis - renewals and downgrades are separate flows.
  if (params.newPlan === params.currentPlan) return null;
  if (ORDER_PRICES[params.newPlan][params.interval].amount <= ORDER_PRICES[params.currentPlan][params.interval].amount) return null;
  const nxt = ORDER_PRICES[params.newPlan][params.interval];
  // Credit = unused share of what was ACTUALLY paid this term (purchase
  // basis preserved across discounts and repeated upgrades). Cost of the new
  // plan for the remaining term uses the current catalog price.
  const credit = Math.round((params.paidThisTerm * remaining) / total);
  const newPlanCost = Math.round((nxt.amount * remaining) / total);
  const due = newPlanCost - credit;
  if (due < 100) return null; // not an upgrade, or below Razorpay's minimum
  return {
    due,
    currency: nxt.currency,
    credit,
    newPlanCost,
    remainingDays: Math.ceil(remaining / 86400000),
  };
}

// Actual paid basis for the current term: prefer the stored value; for older
// records, ground it from the provider's own order record instead of
// assuming the catalog price.
export async function resolvePaidThisTerm(record: { paidThisTerm?: number | null; orderId?: string | null }): Promise<number | null> {
  if (typeof record.paidThisTerm === "number" && record.paidThisTerm > 0) return record.paidThisTerm;
  if (!record.orderId) return null;
  try {
    const order = await razorpayFetchOrder(record.orderId);
    return typeof order.amount === "number" && order.amount > 0 ? order.amount : null;
  } catch {
    return null;
  }
}

export function periodEndFor(interval: BillingInterval, from: Date): string {
  const end = new Date(from);
  if (interval === "annual") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}
