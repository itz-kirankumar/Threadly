"use client";

import { useState } from "react";
import CountUp from "./CountUp";

// A sample intelligence report. Every number and brand is illustrative;
// members see the same report from real answers.

type Assistant = "ChatGPT" | "Claude" | "Gemini";

const DATA: Record<Assistant, { mention: number; citation: number; voice: number; position: number; brands: Array<[string, number]>; sources: string[] }> = {
  ChatGPT: { mention: 52, citation: 24, voice: 33, position: 2.1, brands: [["Your brand", 52], ["Competitor A", 71], ["Competitor B", 38]], sources: ["crm-review.example", "yourbrand.example/pricing", "forum.example/thread"] },
  Claude: { mention: 44, citation: 19, voice: 28, position: 2.6, brands: [["Your brand", 44], ["Competitor A", 63], ["Competitor B", 47]], sources: ["yourbrand.example/docs", "compare.example/crm", "guide.example/sales"] },
  Gemini: { mention: 48, citation: 23, voice: 31, position: 2.4, brands: [["Your brand", 48], ["Competitor A", 58], ["Competitor B", 41]], sources: ["crm-review.example", "directory.example/crm", "yourbrand.example/"] },
};

export default function AIVisibility() {
  const [assistant, setAssistant] = useState<Assistant>("ChatGPT");
  const d = DATA[assistant];
  return (
    <div className="gloss-panel rounded-[20px] p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#A7A0AE]">Tracked buyer question</p>
          <p className="mt-2 font-display text-2xl text-[#F5F0E8]">&ldquo;Which CRM tools are best for small sales teams?&rdquo;</p>
        </div>
        <span className="rounded-full border border-[#D8B982]/30 px-2.5 py-0.5 text-[11px] text-[#D8B982]">Illustrative values</span>
      </div>

      <div role="group" aria-label="Choose an assistant" className="mt-5 inline-flex rounded-full border border-white/[0.08] p-1">
        {(Object.keys(DATA) as Assistant[]).map((a) => (
          <button key={a} type="button" aria-pressed={assistant === a} onClick={() => setAssistant(a)} className={`rounded-full px-4 py-1.5 text-sm transition-colors ${assistant === a ? "bg-white/[0.09] text-[#F5F0E8]" : "text-[#A7A0AE] hover:text-[#F5F0E8]"}`}>{a}</button>
        ))}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {([["Mention rate", d.mention, "%", 0], ["Citation share", d.citation, "%", 0], ["Share of voice", d.voice, "%", 0], ["Average position", d.position, "", 1]] as const).map(([label, value, suffix, decimals]) => (
          <div key={label}>
            <dt className="text-sm text-[#A7A0AE]">{label}</dt>
            <dd className="mt-1 text-4xl tracking-tight text-[#F5F0E8]"><CountUp value={value} suffix={suffix} decimals={decimals} /></dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#A7A0AE]">Brand comparison</p>
          <ul className="mt-4 space-y-3">
            {d.brands.map(([name, value], i) => (
              <li key={name} className="grid grid-cols-[110px_minmax(0,1fr)_40px] items-center gap-3 text-sm">
                <span className={i === 0 ? "text-[#F5F0E8]" : "text-[#A7A0AE]"}>{name}</span>
                <span className="h-1 overflow-hidden rounded-full bg-white/[0.07]"><span className={`block h-full rounded-full transition-[width] duration-500 ${i === 0 ? "bg-[#D8B982]" : "bg-[#9875DB]/70"}`} style={{ width: `${value}%` }} /></span>
                <span className="text-right tabular-nums text-[#A7A0AE]">{value}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#A7A0AE]">Sources cited</p>
          <ul className="mt-4 divide-y divide-white/[0.06] font-mono text-[13px] text-[#A7A0AE]">
            {d.sources.map((s) => <li key={s} className="py-2">{s}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
