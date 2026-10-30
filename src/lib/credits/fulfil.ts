// Turning a provider payment into credits. A payment adds credits only when
// it is complete, is marked as a credit pack, names a workspace and paid
// exactly the pack's server price. The grant is keyed by the payment id, so
// the browser confirmation and the provider webhook can both report it and
// the credits still land once. Dependency-free so it is unit-testable.

import { CREDIT_PACKS, isCreditPack, type CreditPackId } from "./rates.ts";

export interface PaymentFacts {
  provider: "razorpay" | "dodo";
  paymentId: string | null | undefined;
  status: string | null | undefined;
  amount: number | null | undefined;
  currency: string | null | undefined;
  tags: Record<string, unknown> | null | undefined; // Razorpay notes or Dodo metadata
  // Dodo: the products paid for. Dodo totals can include tax, so a Dodo
  // payment is matched by the pack's product id instead of the amount.
  productIds?: string[];
}

export type CreditGrantDecision =
  | { grant: true; workspaceUid: string; pack: CreditPackId; credits: number; ref: string; reason: string }
  | { grant: false; why: string };

const PAID: Record<PaymentFacts["provider"], string[]> = {
  razorpay: ["captured", "authorized"],
  dodo: ["succeeded"],
};

export function decideCreditGrant(p: PaymentFacts): CreditGrantDecision {
  const tags = p.tags ?? {};
  if (tags.kind !== "credits") return { grant: false, why: "not a credit pack payment" };
  if (!p.paymentId) return { grant: false, why: "no payment id" };
  if (!PAID[p.provider].includes(String(p.status ?? ""))) return { grant: false, why: `payment is ${p.status || "not complete"}` };
  const workspaceUid = typeof tags.workspace_uid === "string" ? tags.workspace_uid : "";
  if (!workspaceUid) return { grant: false, why: "no workspace on the payment" };
  if (!isCreditPack(tags.pack)) return { grant: false, why: "unknown pack" };
  const pack = CREDIT_PACKS[tags.pack];
  if (p.provider === "dodo") {
    const product = process.env[pack.dodoProductEnv];
    if (!product || !(p.productIds ?? []).includes(product)) return { grant: false, why: "paid product does not match the pack" };
  } else if (p.amount !== pack.amount || String(p.currency ?? "").toUpperCase() !== pack.currency) {
    return { grant: false, why: "paid amount does not match the pack price" };
  }
  return {
    grant: true,
    workspaceUid,
    pack: tags.pack,
    credits: pack.credits,
    ref: `${p.provider}_${p.paymentId}`,
    reason: `${pack.name} credit pack (${pack.credits.toLocaleString("en-US")} credits)`,
  };
}
