// Region routing for billing providers, owner-directed 27 Oct 2026:
// India -> Razorpay only; all other regions -> Dodo. The region is the
// buyer's billing country, collected pre-charge; the Vercel IP geo header is
// a prefill hint only and never authoritative. Cross-provider fallback is NOT
// implemented here: fallback enabling is gated on terminality verification,
// cross-region authority and equivalent-terms decisions (see decision memo).
// Dependency-free so it is unit-testable in plain node.

export type BillingRegion = "IN" | "OTHER";

export interface RegionRouteInput {
  /** ISO 3166-1 alpha-2 billing country declared by the buyer (required). */
  billingCountry: string | null | undefined;
  dodoOperational: boolean;
  razorpayOperational: boolean;
}

export type RegionRouteResult =
  | { ok: true; provider: "dodo" | "razorpay"; region: BillingRegion }
  | { ok: false; reason: "missing_country" | "provider_unavailable" };

// What is missing when a region's provider is off, in settings terms, for
// the product owner. Customers are shown the general message instead.
export function providerSetupHint(provider: "razorpay" | "dodo", env: Record<string, string | undefined>, productEnv?: string): string {
  if (provider === "razorpay") {
    const id = env.RAZORPAY_KEY_ID ?? "";
    if (!id || !env.RAZORPAY_KEY_SECRET) return "Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the deployment.";
    if (id.startsWith("rzp_live_") && env.RAZORPAY_LIVE_ENABLED !== "true") return "Razorpay live keys are set but charging is off: set RAZORPAY_LIVE_ENABLED=true on the deployment.";
    if (!id.startsWith("rzp_test_") && !id.startsWith("rzp_live_")) return "RAZORPAY_KEY_ID is not a Razorpay key (it should start with rzp_test_ or rzp_live_).";
    return "Razorpay is configured but not accepting orders.";
  }
  if (!env.DODO_PAYMENTS_API_KEY) return "Dodo Payments is not configured: set DODO_PAYMENTS_API_KEY on the deployment.";
  if (productEnv && !env[productEnv]) return `Dodo Payments has no product for this pack: set ${productEnv} on the deployment.`;
  return "Dodo Payments is configured but not accepting checkouts.";
}

export function routeProviderForRegion(input: RegionRouteInput): RegionRouteResult {
  const country = (input.billingCountry || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, reason: "missing_country" };
  const region: BillingRegion = country === "IN" ? "IN" : "OTHER";
  const provider = region === "IN" ? "razorpay" : "dodo";
  const available = provider === "razorpay" ? input.razorpayOperational : input.dodoOperational;
  if (!available) return { ok: false, reason: "provider_unavailable" };
  return { ok: true, provider, region };
}
