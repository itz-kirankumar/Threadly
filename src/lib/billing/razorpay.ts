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
