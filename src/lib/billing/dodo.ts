import DodoPayments from "dodopayments";

export type BillingInterval = "monthly" | "annual";
export type PaidPlanId = "pro" | "growth";

export function billingConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY);
}

export function billingTestMode(): boolean {
  return process.env.DODO_PAYMENTS_ENVIRONMENT !== "live_mode";
}

export function dodoClient(): DodoPayments {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
  if (!bearerToken) throw new Error("Billing is not configured on this deployment.");
  return new DodoPayments({
    bearerToken,
    environment: billingTestMode() ? "test_mode" : "live_mode",
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? null,
  });
}

const PRODUCT_ENV: Record<PaidPlanId, Record<BillingInterval, string>> = {
  pro: { monthly: "DODO_PRODUCT_PRO_MONTHLY", annual: "DODO_PRODUCT_PRO_ANNUAL" },
  growth: { monthly: "DODO_PRODUCT_GROWTH_MONTHLY", annual: "DODO_PRODUCT_GROWTH_ANNUAL" },
};

export function productFor(plan: PaidPlanId, interval: BillingInterval): string {
  const id = process.env[PRODUCT_ENV[plan][interval]];
  if (!id) throw new Error("Billing is not fully configured on this deployment.");
  return id;
}

export function planFromProductId(productId: string | null | undefined): PaidPlanId | null {
  if (!productId) return null;
  for (const plan of ["pro", "growth"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (process.env[PRODUCT_ENV[plan][interval]] === productId) return plan;
    }
  }
  return null;
}

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return value === "pro" || value === "growth";
}

export function isInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

/** While in test mode, only these emails can start checkout (comma-separated env). */
export function canCheckout(email: string | null | undefined): boolean {
  if (!billingTestMode()) return true;
  const allowed = (process.env.BILLING_TEST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && allowed.includes(email!.toLowerCase());
}
