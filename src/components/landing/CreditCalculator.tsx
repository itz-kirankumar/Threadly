"use client";

import Link from "next/link";
import { useState } from "react";
import { CREDIT_PACKS, CREDIT_RATES } from "@/lib/credits/rates";

const { starter, growth, scale } = CREDIT_PACKS;

// Each stop is something that can actually be bought: one pack or several.
const STOPS = [
  { amount: starter.amount, credits: starter.credits },
  { amount: starter.amount * 2, credits: starter.credits * 2 },
  { amount: growth.amount, credits: growth.credits },
  { amount: growth.amount * 2, credits: growth.credits * 2 },
  { amount: scale.amount, credits: scale.credits },
  { amount: scale.amount * 2, credits: scale.credits * 2 },
];

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

// What a spend buys, worked out from the credit rates. No reply or meeting
// forecasts: those depend on the market, and credits buy results, not replies.
export default function CreditCalculator() {
  const [index, setIndex] = useState(2);
  const stop = STOPS[index];
  const progress = (index / (STOPS.length - 1)) * 100;
  const tiles = [
    ["Credits", fmt(stop.credits)],
    ["Companies with a first email", fmt(stop.credits / (CREDIT_RATES.company + CREDIT_RATES.email))],
    ["Social leads", fmt(stop.credits / CREDIT_RATES.socialLead)],
    ["AI visibility scans", fmt(stop.credits / CREDIT_RATES.scan)],
  ];
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-black/[0.07] bg-white p-6 shadow-[0_8px_30px_-18px_rgba(17,17,20,0.25)] sm:p-8">
      <div className="relative h-8">
        <output htmlFor="spend" className="absolute -translate-x-1/2 whitespace-nowrap text-2xl font-semibold tabular-nums text-[#111114] transition-[left] duration-150" style={{ left: `clamp(32px, ${progress}%, calc(100% - 32px))` }}>
          ${fmt(stop.amount / 100)}
        </output>
      </div>
      <label htmlFor="spend" className="sr-only">Amount to spend on credits</label>
      <input
        id="spend"
        type="range"
        min={0}
        max={STOPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-valuetext={`$${fmt(stop.amount / 100)}, ${fmt(stop.credits)} credits`}
        className="credit-range mt-3 w-full"
        style={{ ["--fill" as string]: `${progress}%` }}
      />
      <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#F3F2EE] px-4 py-3.5">
            <p className="text-2xl font-semibold tabular-nums text-[#111114]">{value}</p>
            <p className="mt-0.5 text-sm text-[#6B6A72]">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-center">
        <Link href="/#early-access" className="btn-primary rounded-xl px-6 py-3 text-sm font-medium">Request an invitation</Link>
      </div>
    </div>
  );
}
