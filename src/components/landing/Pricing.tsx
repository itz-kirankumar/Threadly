import Link from "next/link";

// Pay for what you use, invite-only. Every action in a workspace costs
// credits; packs buy credits at a lower rate. Rates are set below the usual
// per-seat prospecting tools (no seat fees) and per-credit enrichment tools.

const RATES: { action: string; credits: number; note: string }[] = [
  { action: "Research run", credits: 1, note: "Your site, AI crawler score, competitors and campaigns" },
  { action: "Matching company", credits: 1, note: "Homepage read and checked against your campaign" },
  { action: "Social lead", credits: 2, note: "Public Reddit, X or LinkedIn post with a drafted reply" },
  { action: "AI-written email", credits: 1, note: "Drafted from the company's own words, with sources" },
  { action: "Decision maker contact", credits: 5, note: "From a licensed provider, charged only when found" },
  { action: "AI visibility scan", credits: 10, note: "ChatGPT, Claude and Gemini, per tracked question set" },
];

interface Pack {
  name: string;
  price: string;
  credits: string;
  perCredit: string;
  blurb: string;
  highlight?: boolean;
}

const PACKS: Pack[] = [
  { name: "Starter", price: "$49", credits: "1,000 credits", perCredit: "4.9¢ per credit", blurb: "About 300 companies with emails, or 150 social leads with replies." },
  { name: "Growth", price: "$199", credits: "5,000 credits", perCredit: "4.0¢ per credit", blurb: "A steady weekly pipeline for a small sales team.", highlight: true },
  { name: "Scale", price: "$599", credits: "20,000 credits", perCredit: "3.0¢ per credit", blurb: "Agencies and teams running several campaigns at once." },
  { name: "Enterprise", price: "Custom", credits: "Committed volume", perCredit: "Volume rates", blurb: "SSO, custom terms, invoicing and a dedicated manager." },
];

export default function Pricing({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
        {[
          ["Invite-only", "Teams are invited from the waitlist by fit score, so every workspace has real lead-generation use."],
          ["No seats, no subscription", "Invite your whole team. You pay for results the platform produces, nothing else."],
          ["200 free credits", "Every invited workspace starts with free credits to run its first campaign."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PACKS.map((pack) => (
          <div key={pack.name} className={`relative flex flex-col rounded-2xl border p-6 ${pack.highlight ? "border-violet-400/50 bg-violet-500/[0.07]" : "border-white/10 bg-white/[0.02]"}`}>
            {pack.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-1 text-[11px] font-semibold text-white">Best value</span>}
            <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{pack.name}</h3>
            <p className="mt-4 text-3xl font-bold text-white">{pack.price}</p>
            <p className="mt-1 text-sm text-zinc-300">{pack.credits}</p>
            <p className="text-xs text-zinc-500">{pack.perCredit}</p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-400">{pack.blurb}</p>
            <Link
              href={pack.name === "Enterprise" ? "/contact" : "/#early-access"}
              className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition ${pack.highlight ? "bg-white text-zinc-950 hover:bg-zinc-200" : "border border-white/15 text-white hover:bg-white/[0.06]"}`}
            >
              {pack.name === "Enterprise" ? "Talk to us" : "Request an invite"}
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500">Pay as you go at 5¢ per credit without a pack. Credits do not expire during the beta. Prices in USD, excluding tax.</p>

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
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400">${(r.credits * 0.04).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
