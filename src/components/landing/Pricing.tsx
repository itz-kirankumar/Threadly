import Link from "next/link";
import { CREDIT_LABELS, CREDIT_RATES, FIRST_PACK_BONUS_CAP, FIRST_PACK_BONUS_PERCENT, WELCOME_CREDITS, type CreditAction } from "@/lib/credits/rates";
import CreditCalculator from "./CreditCalculator";

// Pay for what you use, invite-only. One calculator holds the packs; the
// rates and terms sit under it as plain text. Everything reads from the credit
// rate table, so what is advertised is what is billed.

const RATE_NOTES: Record<CreditAction, string> = {
  research: "Site, AI readiness, competitors and campaigns",
  company: "Homepage read and checked against your campaign",
  socialLead: "Public Reddit, X or LinkedIn post",
  email: "Drafted from the company's own words",
  contact: "From a licensed provider, only when found",
  scan: "ChatGPT, Claude and Gemini across your questions",
};

const TERMS = [
  ["Invite-only", "Teams are onboarded through the eligibility checks."],
  ["No seats, no subscription", "Invite your whole team and pay only for results."],
  [`${WELCOME_CREDITS} free credits`, "Every onboarded workspace starts with free credits."],
];

export default function Pricing() {
  const bonus = FIRST_PACK_BONUS_PERCENT === 100 ? "double credits" : `+${FIRST_PACK_BONUS_PERCENT}% credits`;
  return (
    <div>
      <CreditCalculator />

      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <h3 className="text-sm font-medium text-[#6B6A72]">What each result costs</h3>
          <dl className="mt-3 border-t border-black/[0.09]">
            {(Object.keys(CREDIT_RATES) as CreditAction[]).map((id) => (
              <div key={id} className="flex items-baseline justify-between gap-6 border-b border-black/[0.09] py-3">
                <dt className="min-w-0">
                  <span className="text-[15px] text-[#111114]">{CREDIT_LABELS[id]}</span>
                  <span className="block text-sm text-[#6B6A72]">{RATE_NOTES[id]}</span>
                </dt>
                <dd className="shrink-0 text-[15px] tabular-nums text-[#111114]">{CREDIT_RATES[id]} {CREDIT_RATES[id] === 1 ? "credit" : "credits"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-medium text-[#6B6A72]">How membership works</h3>
          <ul className="mt-3 space-y-5 border-t border-black/[0.09] pt-4">
            {TERMS.map(([title, body]) => (
              <li key={title}>
                <p className="text-[15px] text-[#111114]">{title}</p>
                <p className="text-sm text-[#6B6A72]">{body}</p>
              </li>
            ))}
            <li>
              <p className="text-[15px] text-[#111114]">Larger volumes</p>
              <p className="text-sm text-[#6B6A72]">Committed volume, SSO, invoicing and custom terms. <Link href="/contact" className="font-medium text-[#5B3DF5] hover:underline">Talk to us</Link></p>
            </li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-[#6B6A72]">
            {FIRST_PACK_BONUS_PERCENT > 0 ? `Your first pack earns ${bonus}, up to ${FIRST_PACK_BONUS_CAP.toLocaleString("en-US")} extra. ` : ""}Credits do not expire during the beta. Prices in USD, excluding tax.
          </p>
        </div>
      </div>
    </div>
  );
}
