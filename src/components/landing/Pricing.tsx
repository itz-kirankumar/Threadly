import Link from "next/link";
import { CREDIT_LABELS, CREDIT_PACKS, CREDIT_RATES, FIRST_PACK_BONUS_CAP, FIRST_PACK_BONUS_PERCENT, WELCOME_CREDITS, formatPackPrice, type CreditAction } from "@/lib/credits/rates";

// Pay for what you use, invite-only. Every action in a workspace costs
// credits; packs buy credits at a lower rate. Rates are set below the usual
// per-seat prospecting tools (no seat fees) and per-credit enrichment tools.

const RATE_NOTES: Record<CreditAction, string> = {
  research: "Your site, AI crawler score, competitors and campaigns",
  company: "Homepage read and checked against your campaign",
  socialLead: "Public Reddit, X or LinkedIn post",
  email: "Drafted from the company's own words, with sources",
  contact: "From a licensed provider, charged only when found",
  scan: "ChatGPT, Claude and Gemini, across your tracked questions",
};

const RATES = (Object.keys(CREDIT_RATES) as CreditAction[]).map((id) => ({ action: CREDIT_LABELS[id], credits: CREDIT_RATES[id], note: RATE_NOTES[id] }));
const GROWTH_RATE = CREDIT_PACKS.growth.amount / CREDIT_PACKS.growth.credits / 100;

interface Pack {
  name: string;
  price: string;
  credits: string;
  perCredit: string;
  blurb: string;
  highlight?: boolean;
}

const BLURBS = {
  starter: "About 500 companies with first emails, or 500 social leads.",
  growth: "A steady weekly pipeline for a small sales team.",
  scale: "Agencies and teams running several campaigns at once.",
};

const PACKS: Pack[] = [
  ...(Object.keys(CREDIT_PACKS) as Array<keyof typeof CREDIT_PACKS>).map((id) => {
    const p = CREDIT_PACKS[id];
    return {
      name: p.name,
      price: formatPackPrice(p.amount),
      credits: `${p.credits.toLocaleString("en-US")} credits`,
      perCredit: `${(p.amount / p.credits).toFixed(1)}¢ per credit`,
      blurb: BLURBS[id],
      highlight: id === "growth",
    };
  }),
  { name: "Enterprise", price: "Custom", credits: "Committed volume", perCredit: "Volume rates", blurb: "SSO, custom terms, invoicing and a dedicated manager." },
];

export default function Pricing({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Invite-only", "Teams are invited from the waitlist by fit score, so every workspace has real lead-generation use."],
          ["No seats, no subscription", "Invite your whole team. You pay for results the platform produces, nothing else."],
          [`${WELCOME_CREDITS} free credits`, "Every invited workspace starts with free credits to run its first campaign."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PACKS.map((pack) => (
          <div key={pack.name} className={`relative flex flex-col rounded-2xl border p-6 ${pack.highlight ? "gloss-panel !border-[#5B3DF5]/35" : "border-white/10 bg-white/[0.02]"}`}>
            {pack.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-[#5B3DF5]/40 bg-[#FFFFFF] px-3 py-1 text-[11px] text-[#5B3DF5]">Best value</span>}
            <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{pack.name}</h3>
            <p className="mt-4 font-display text-4xl text-white">{pack.price}</p>
            <p className="mt-1 text-sm text-zinc-300">{pack.credits}</p>
            <p className="text-xs text-zinc-500">{pack.perCredit}</p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">{pack.blurb}</p>
            <Link
              href={pack.name === "Enterprise" ? "/contact" : "/#early-access"}
              className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition ${pack.highlight ? "btn-primary" : "border border-white/15 text-white hover:bg-white/[0.06]"}`}
            >
              {pack.name === "Enterprise" ? "Talk to us" : "Request an invite"}
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500">{FIRST_PACK_BONUS_PERCENT > 0 ? `Your first pack earns ${FIRST_PACK_BONUS_PERCENT === 100 ? "double credits" : `+${FIRST_PACK_BONUS_PERCENT}% credits`}, up to ${FIRST_PACK_BONUS_CAP.toLocaleString("en-US")} extra. ` : ""}Credits do not expire during the beta. Plans cover AI visibility scans for teams on a fixed term. Prices in USD, excluding tax.</p>

      {!compact && (
        <div className="mt-14 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3.5 font-medium">What you pay for</th>
                <th className="px-4 py-3.5 text-right font-medium">Credits</th>
                <th className="px-4 py-3.5 text-right font-medium">At Growth rate</th>
              </tr>
            </thead>
            <tbody>
              {RATES.map((r) => (
                <tr key={r.action} className="border-b border-white/5">
                  <td className="px-5 py-3">
                    <p className="text-zinc-200">{r.action}</p>
                    <p className="text-xs text-zinc-500">{r.note}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-200">{r.credits}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">${(r.credits * GROWTH_RATE).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
