"use client";

import Link from "next/link";
import { useState } from "react";
import { CREDIT_PACKS, CREDIT_RATES } from "@/lib/credits/rates";
import CountUp from "./CountUp";

const { starter, growth, scale } = CREDIT_PACKS;

// Each stop is something that can actually be bought: one pack or several.
const STOPS = [
  { label: "Starter pack", amount: starter.amount, credits: starter.credits },
  { label: "2 Starter packs", amount: starter.amount * 2, credits: starter.credits * 2 },
  { label: "Growth pack", amount: growth.amount, credits: growth.credits },
  { label: "2 Growth packs", amount: growth.amount * 2, credits: growth.credits * 2 },
  { label: "Scale pack", amount: scale.amount, credits: scale.credits },
  { label: "2 Scale packs", amount: scale.amount * 2, credits: scale.credits * 2 },
];

// What a spend buys, worked out from the credit rates. No reply or meeting
// forecasts: those depend on the market, and credits buy results, not replies.
export default function CreditCalculator() {
  const [index, setIndex] = useState(2);
  const stop = STOPS[index];
  const rows: Array<[string, number]> = [
    ["Companies with a first email", Math.floor(stop.credits / (CREDIT_RATES.company + CREDIT_RATES.email))],
    ["Social leads", Math.floor(stop.credits / CREDIT_RATES.socialLead)],
    ["Decision-maker contacts", Math.floor(stop.credits / CREDIT_RATES.contact)],
    ["AI visibility scans", Math.floor(stop.credits / CREDIT_RATES.scan)],
  ];
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-3xl bg-[#111114] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="p-7 sm:p-10">
        <p className="text-sm text-[#A9A8B1]">{stop.label}</p>
        <p className="mt-2 text-6xl font-medium tracking-tight text-[#FFFFFF] sm:text-7xl"><CountUp value={stop.amount / 100} prefix="$" /></p>
        <p className="mt-2 text-[#A9A8B1]"><CountUp value={stop.credits} suffix=" credits" /> · {(stop.amount / stop.credits).toFixed(1)}¢ each</p>

        <label htmlFor="spend" className="sr-only">Amount to spend on credits</label>
        <input
          id="spend"
          type="range"
          min={0}
          max={STOPS.length - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-valuetext={`$${stop.amount / 100}, ${stop.credits} credits`}
          className="credit-range mt-9 w-full"
          style={{ ["--fill" as string]: `${(index / (STOPS.length - 1)) * 100}%` }}
        />
        <div className="mt-3 flex justify-between">
          {STOPS.map((s, i) => (
            <button key={s.label} type="button" onClick={() => setIndex(i)} aria-label={s.label} className={`text-xs tabular-nums transition-colors ${i === index ? "text-[#FFFFFF]" : "text-[#77767F] hover:text-[#FFFFFF]"}`}>
              ${(s.amount / 100).toLocaleString("en-US")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col border-t border-[#2B2A31] p-7 sm:p-10 lg:border-l lg:border-t-0">
        <p className="text-sm text-[#A9A8B1]">Spend it on any mix, for example</p>
        <dl className="mt-3 flex-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-[#2B2A31] py-3.5">
              <dt className="text-sm text-[#D6D5DB]">{label}</dt>
              <dd className="text-2xl font-medium tracking-tight text-[#FFFFFF]"><CountUp value={value} /></dd>
            </div>
          ))}
        </dl>
        <Link href="/#early-access" className="mt-6 block rounded-xl bg-[#FFFFFF] px-6 py-3 text-center text-sm font-medium text-[#111114] transition-colors hover:bg-[#E4E3DF]">Request an invitation</Link>
      </div>
    </div>
  );
}
