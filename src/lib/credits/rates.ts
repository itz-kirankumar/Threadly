// Pay-per-result pricing. One table drives the pricing page, the portal and
// every charge, so what is advertised is what is billed. Dependency-free so
// it is unit-testable in plain node.

export const CREDIT_RATES = {
  research: 1, // one research run: site, competitors and campaigns
  company: 1, // one matching company, homepage read and checked
  socialLead: 2, // one public Reddit, X or LinkedIn post
  email: 1, // one drafted first email
  contact: 5, // one decision maker from the licensed provider, only when found
  scan: 10, // one AI visibility scan
} as const;

export type CreditAction = keyof typeof CREDIT_RATES;

export const CREDIT_LABELS: Record<CreditAction, string> = {
  research: "Research run",
  company: "Matching company",
  socialLead: "Social lead",
  email: "AI-written email",
  contact: "Decision maker contact",
  scan: "AI visibility scan",
};

// Granted once to every workspace, the first time it touches credits.
export const WELCOME_CREDITS = Number(process.env.WELCOME_CREDITS ?? "200");

// The first pack a workspace buys earns bonus credits (100 = doubled),
// capped. Applied by the ledger at grant time, not by the browser.
export const FIRST_PACK_BONUS_PERCENT = Number(process.env.FIRST_PACK_BONUS_PERCENT ?? "100");
export const FIRST_PACK_BONUS_CAP = Number(process.env.FIRST_PACK_BONUS_CAP ?? "5000");

export function firstPackBonus(credits: number): number {
  return Math.max(0, Math.min(FIRST_PACK_BONUS_CAP, Math.round((credits * FIRST_PACK_BONUS_PERCENT) / 100)));
}

export type CreditPackId = "starter" | "growth" | "scale";

// Server-authoritative pack prices in the smallest currency unit. Clients
// pick a pack id only; amounts never come from the browser.
export const CREDIT_PACKS: Record<CreditPackId, { name: string; credits: number; amount: number; currency: "USD"; dodoProductEnv: string }> = {
  starter: { name: "Starter", credits: 1000, amount: 4900, currency: "USD", dodoProductEnv: "DODO_PRODUCT_CREDITS_STARTER" },
  growth: { name: "Growth", credits: 5000, amount: 19900, currency: "USD", dodoProductEnv: "DODO_PRODUCT_CREDITS_GROWTH" },
  scale: { name: "Scale", credits: 20000, amount: 59900, currency: "USD", dodoProductEnv: "DODO_PRODUCT_CREDITS_SCALE" },
};

export function isCreditPack(value: unknown): value is CreditPackId {
  return typeof value === "string" && value in CREDIT_PACKS;
}

