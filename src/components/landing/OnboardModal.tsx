"use client";

import { useEffect, useState } from "react";
import QualifyForm from "./QualifyForm";

export interface RunStats {
  domain: string;
  name: string;
  readiness: number | null;
  competitors: number;
  companies: number;
  socialLeads: number;
  drafts: number;
}

// Credits per result, kept in step with lib/credits/rates.ts.
const COMPANY_WITH_EMAIL = 2;
const SOCIAL_LEAD = 2;

const PACKS = [
  { id: "starter", name: "Starter", price: 49, credits: 1000 },
  { id: "growth", name: "Growth", price: 199, credits: 5000 },
  { id: "scale", name: "Scale", price: 599, credits: 20000 },
];

// The end of the live run: pick a pack and check eligibility. Threadly is
// invite-only, so payment happens in the workspace after onboarding.
export default function OnboardModal({ open, onClose, stats, bonus }: { open: boolean; onClose: () => void; stats: RunStats; bonus: { percent: number; cap: number } }) {
  const [pack, setPack] = useState("growth");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const chosen = PACKS.find((p) => p.id === pack)!;
  const extra = (credits: number) => Math.min(bonus.cap, Math.round((credits * bonus.percent) / 100));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Start with Threadly" onClick={onClose}>
      <div className="demo-modal-in relative grid text-left max-h-[92vh] w-full max-w-5xl gap-4 overflow-y-auto rounded-t-3xl bg-[#f7f6f3] p-4 sm:rounded-3xl sm:p-5 lg:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-500 shadow-sm hover:text-zinc-900">✕</button>

        <div className="grid content-start gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="flex items-center gap-2 font-semibold"><span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /></span>
              {bonus.percent > 0 ? `First pack: ${bonus.percent === 100 ? "double your credits" : `+${bonus.percent}% credits`}` : "Pay per result"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">No seats or subscription. Credits are spent only on results.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {PACKS.map((p) => {
                const total = p.credits + extra(p.credits);
                return (
                  <button key={p.id} type="button" onClick={() => setPack(p.id)} className={`rounded-xl border-2 px-2 py-3 text-center transition ${pack === p.id ? "border-emerald-600 bg-emerald-50/40" : "border-zinc-200 hover:border-zinc-400"}`}>
                    <p className="font-semibold">${p.price}{bonus.percent > 0 && <span className="text-emerald-600"> → {total.toLocaleString()}</span>}</p>
                    <p className="mt-1 text-xs text-zinc-600">{(bonus.percent > 0 ? total : p.credits).toLocaleString()} credits</p>
                    <p className="text-xs text-zinc-500">~{Math.floor((bonus.percent > 0 ? total : p.credits) / COMPANY_WITH_EMAIL).toLocaleString()} companies + emails</p>
                  </button>
                );
              })}
            </div>
            {bonus.percent > 0 && <p className="mt-2 text-[11px] text-zinc-500">Bonus applies to your first pack, up to {bonus.cap.toLocaleString()} extra credits.</p>}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="font-semibold">From your run on {stats.name || stats.domain}</p>
            <p className="text-xs text-zinc-500">Real results from the last two minutes, not a sample.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["AI readiness", stats.readiness === null ? "–" : `${stats.readiness}/100`],
                ["Competitors", stats.competitors],
                ["Companies", stats.companies],
                ["Social leads", stats.socialLeads],
                ["Emails drafted", stats.drafts],
                ["Pack covers", `~${Math.floor((chosen.credits + (bonus.percent > 0 ? extra(chosen.credits) : 0)) / SOCIAL_LEAD).toLocaleString()} leads`],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-[11px] text-zinc-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="flex items-center gap-2 font-semibold"><span className="grid grid-cols-2 gap-0.5" aria-hidden><span className="h-1.5 w-1.5 bg-emerald-600" /><span className="h-1.5 w-1.5 bg-emerald-300" /><span className="h-1.5 w-1.5 bg-emerald-300" /><span className="h-1.5 w-1.5 bg-emerald-600" /></span>Check your eligibility</p>
          <p className="mt-1 text-sm text-zinc-500">Threadly is invite-only. We run a few checks on your business; teams that pass are onboarded now, and you buy the {chosen.name} pack (${chosen.price}) inside your workspace.</p>
          <div className="mt-4">
            <QualifyForm defaultDomain={stats.domain} pack={chosen.name} compact />
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-400">Payments by Razorpay (India) and Dodo Payments</p>
        </div>
      </div>
    </div>
  );
}
