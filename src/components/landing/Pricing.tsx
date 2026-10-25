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
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: "Starter",
    monthly: 0,
    annualMonthly: 0,
    blurb: "For founders getting their first read on AI visibility.",
    cta: "Start free",
    features: [
      "10 tracked buyer questions",
      "ChatGPT, Claude and Gemini",
      "Daily automatic scans",
      "Mention rate, share of voice, citations",
      "30-day scan history",
      "1 workspace seat",
    ],
  },
  {
    name: "Pro",
    monthly: 49,
    annualMonthly: 39,
    blurb: "For marketers building a repeatable GEO motion.",
    cta: "Get started",
    highlight: true,
    features: [
      "50 tracked buyer questions",
      "All providers + custom OpenAI-compatible providers",
      "Bring your own API keys",
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
    cta: "Get started",
    features: [
      "150 tracked buyer questions",
      "Everything in Pro",
      "Team workspace - up to 25 seats with roles",
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
      "Dedicated onboarding and success manager",
      "Custom terms and invoicing",
    ],
  },
];

export default function Pricing({ compact = false }: { compact?: boolean }) {
  const [annual, setAnnual] = useState(true);
  return (
    <div>
      <div className="flex items-center justify-center gap-3 text-sm">
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
              <p className="mt-1 text-xs text-zinc-500">{annual ? "Billed annually" : "Billed monthly"}</p>
            )}
            {tier.monthly === 0 && <p className="mt-1 text-xs text-zinc-500">Free forever</p>}
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{tier.blurb}</p>
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

      <p className="mt-8 text-center text-xs text-zinc-500">
        Early access: every plan is free while Threadly is in beta. Paid plans switch on when billing launches -
        no card collected today.
      </p>
    </div>
  );
}
