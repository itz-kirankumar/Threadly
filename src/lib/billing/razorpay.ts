import crypto from "node:crypto";
import type { BillingInterval, PaidPlanId } from "./dodo";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
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

export async function razorpayFetchPayment(paymentId: string): Promise<{
  id: string;
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
  now?: Date;
}): { due: number; currency: string; credit: number; newPlanCost: number; remainingDays: number } | null {
  const now = params.now ?? new Date();
  const end = Date.parse(params.periodEnd);
  const start = Date.parse(params.purchasedAt);
  const total = end - start;
  const remaining = end - now.getTime();
  if (!Number.isFinite(total) || total <= 0 || remaining <= 0) return null;
  const cur = ORDER_PRICES[params.currentPlan][params.interval];
  const nxt = ORDER_PRICES[params.newPlan][params.interval];
  if (nxt.amount <= cur.amount) return null; // upgrades only, same interval
  const due = Math.round(((nxt.amount - cur.amount) * remaining) / total);
  if (due < 100) return null; // Razorpay minimum order amount (subunits)
  return {
    due,
    currency: nxt.currency,
    credit: Math.round((cur.amount * remaining) / total),
    newPlanCost: Math.round((nxt.amount * remaining) / total),
    remainingDays: Math.ceil(remaining / 86400000),
  };
}

export function periodEndFor(interval: BillingInterval, from: Date): string {
  const end = new Date(from);
  if (interval === "annual") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end.toISOString();
}
