"use client";

import Link from "next/link";
import { useState } from "react";

interface Tier {
  name: string;
  monthly: number | null;
  annualMonthly: number | null;
  blurb: string;
  cta: string;
  highlight?: boolean;
  unitAnchor?: string;
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: "Trial",
    monthly: 0,
    annualMonthly: 0,
    blurb: "For founders getting their first read on AI visibility.",
    cta: "Start free trial",
    features: [
      "10 tracked buyer questions",
      "1 full scan across all providers",
      "ChatGPT, Claude and Gemini",
      "Mention rate, share of voice, citations",
      "AI crawler access check",
      "7-day scan history",
      "1 workspace seat",
    ],
  },
  {
    name: "Pro",
    monthly: 49,
    annualMonthly: 39,
    blurb: "For marketers building a repeatable GEO motion.",
    cta: "Start free",
    highlight: true,
    unitAnchor: "78\u00A2 per tracked question",
    features: [
      "50 tracked buyer questions",
      "All providers + custom OpenAI-compatible providers",
      "Bring your own API keys",
      "Visibility gap recommendations",
      "Daily automatic scans, unlimited history",
      "Citation leaderboard and answer archive",
      "Team workspace - up to 5 seats",
    ],
  },
  {
    name: "Growth",
    monthly: 149,
    annualMonthly: 119,
    blurb: "For teams and agencies managing serious coverage.",
    cta: "Start free",
    unitAnchor: "79\u00A2 per tracked question",
    features: [
      "150 tracked buyer questions",
      "Everything in Pro",
      "Team workspace - up to 25 seats with roles",
      "Activity log (audit trail)",
      "Public API access",
      "Unlimited custom providers",
      "Priority scan queue",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    monthly: null,
    annualMonthly: null,
    blurb: "For global brands that need custom coverage and terms.",
    cta: "Talk to us",
    features: [
      "Unlimited tracked questions",
      "Everything in Growth",
      "Unlimited seats with role hierarchy",
      "Custom scan frequency and providers",
      "Custom API rate limits and data exports",
      "Dedicated onboarding and success manager",
      "Custom terms and invoicing",
    ],
  },
];

const COMPARISON: { label: string; values: (string | boolean)[] }[] = [
  { label: "Tracked buyer questions", values: ["10", "50", "150", "Unlimited"] },
  { label: "Full scans", values: ["1 total", "Unlimited", "Unlimited", "Unlimited"] },
  { label: "ChatGPT, Claude and Gemini", values: [true, true, true, true] },
  { label: "Custom OpenAI-compatible providers", values: [false, true, true, true] },
  { label: "Bring your own API keys", values: [false, true, true, true] },
  { label: "Visibility gap recommendations", values: [false, true, true, true] },
  { label: "AI crawler access check", values: [true, true, true, true] },
  { label: "Scan history", values: ["7 days", "Unlimited", "Unlimited", "Unlimited"] },
  { label: "Workspace seats", values: ["1", "5", "25", "Unlimited"] },
  { label: "Roles and invite links", values: [false, true, true, true] },
  { label: "Activity log (audit trail)", values: [false, false, true, true] },
  { label: "Public API access", values: [false, false, true, true] },
  { label: "Support", values: ["Community", "Standard", "Priority", "Dedicated manager"] },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Pricing({ compact = false }: { compact?: boolean }) {
  const [annual, setAnnual] = useState(true);
  return (
    <div>
      <p className="mx-auto w-fit rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-center text-sm font-medium text-emerald-200">
        Early access: paid plans are free until billing launches - no card collected today.
      </p>

      <div className="mt-6 flex items-center justify-center gap-3 text-sm">
        <span className={annual ? "text-zinc-500" : "text-zinc-200"}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          onClick={() => setAnnual(!annual)}
          className={`relative h-6 w-11 rounded-full transition ${annual ? "bg-violet-500" : "bg-zinc-700"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${annual ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className={annual ? "text-zinc-200" : "text-zinc-500"}>
          Annual <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Save 20%</span>
        </span>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              tier.highlight ? "border-violet-400/50 bg-violet-500/[0.07]" : "border-white/10 bg-white/[0.02]"
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-1 text-[11px] font-semibold text-white">
                Most popular
              </span>
            )}
            <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{tier.name}</h3>
            <div className="mt-4 flex items-baseline gap-1.5">
              {tier.monthly === null ? (
                <span className="text-3xl font-bold text-white">Custom</span>
              ) : (
                <>
                  <span className="text-3xl font-bold text-white">
                    ${annual ? tier.annualMonthly : tier.monthly}
                  </span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </>
              )}
            </div>
            {tier.monthly !== null && tier.monthly > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                {annual ? "Billed annually" : "Billed monthly"}
                {annual && tier.unitAnchor ? ` · ${tier.unitAnchor}` : ""}
              </p>
            )}
            {tier.monthly === 0 && <p className="mt-1 text-xs text-zinc-500">Free, no card needed</p>}
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{tier.blurb}</p>
            {tier.name === "Pro" || tier.name === "Growth" ? (
              <>
                <Link
                  href={`/checkout?plan=${tier.name.toLowerCase()}&interval=${annual ? "annual" : "monthly"}`}
                  className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition ${
                    tier.highlight
                      ? "bg-white text-zinc-950 hover:bg-zinc-200"
                      : "border border-white/15 text-white hover:bg-white/[0.06]"
                  }`}
                >
                  Buy now - no sign-in needed
                </Link>
                <Link href="/portal" className="mt-2 block rounded-lg py-1.5 text-center text-xs text-zinc-500 transition hover:text-zinc-300">
                  or start free first
                </Link>
              </>
            ) : (
              <Link
                href="/portal"
                className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition ${
                  tier.highlight
                    ? "bg-white text-zinc-950 hover:bg-zinc-200"
                    : "border border-white/15 text-white hover:bg-white/[0.06]"
                }`}
              >
                {tier.cta}
              </Link>
            )}
            {!compact && (
              <ul className="mt-6 space-y-2.5 text-sm text-zinc-300">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        No credit card required · Cancel anytime · Early users keep their workspaces and history.
      </p>

      {!compact && (
        <div className="mt-14 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3.5 font-medium">Compare plans</th>
                {TIERS.map((tier) => (
                  <th key={tier.name} className={`px-4 py-3.5 text-center font-medium ${tier.highlight ? "text-violet-300" : ""}`}>
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-white/5">
                  <td className="px-5 py-3 text-zinc-300">{row.label}</td>
                  {row.values.map((value, i) => (
                    <td key={TIERS[i].name} className={`px-4 py-3 text-center ${TIERS[i].highlight ? "bg-violet-500/[0.05]" : ""}`}>
                      {typeof value === "boolean" ? (value ? <Check /> : <span className="text-zinc-700">—</span>) : (
                        <span className="text-zinc-300">{value}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
