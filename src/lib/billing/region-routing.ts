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

export function routeProviderForRegion(input: RegionRouteInput): RegionRouteResult {
  const country = (input.billingCountry || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, reason: "missing_country" };
  const region: BillingRegion = country === "IN" ? "IN" : "OTHER";
  const provider = region === "IN" ? "razorpay" : "dodo";
  const available = provider === "razorpay" ? input.razorpayOperational : input.dodoOperational;
  if (!available) return { ok: false, reason: "provider_unavailable" };
  return { ok: true, provider, region };
}
