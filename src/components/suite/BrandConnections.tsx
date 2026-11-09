"use client";

import type { BrandProfile } from "@/lib/geo/types";
import { BRAND_PROFILE_USES, appById, type AppId } from "@/lib/suite/apps";
import { APP_ICONS } from "./icons";

// Beside the brand profile: every app that reads it, and what it uses it
// for, so one save visibly updates the whole suite.
export default function BrandConnections({ brand, queries, onOpenApp }: { brand: BrandProfile; queries: number; onOpenApp: (id: AppId) => void }) {
  const checks = [
    { ok: Boolean(brand.name && brand.domain), text: "Name and domain" },
    { ok: Boolean(brand.category?.trim()), text: "What you sell" },
    { ok: brand.competitors.length >= 2, text: `Two or more competitors (${brand.competitors.length})` },
    { ok: Boolean(brand.logoDataUrl), text: "Logo" },
    { ok: queries > 0, text: `Buyer questions (${queries})` },
  ];
  const done = checks.filter((c) => c.ok).length;
  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Profile strength</p>
          <span className="text-xs tabular-nums text-zinc-400">{done}/{checks.length}</span>
        </div>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/5">
          <span className="block h-full rounded-full bg-violet-500" style={{ width: `${(done / checks.length) * 100}%` }} />
        </span>
        <ul className="mt-3 space-y-1.5">
          {checks.map((c) => (
            <li key={c.text} className="flex items-center gap-2 text-xs">
              <span aria-hidden className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${c.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-zinc-500"}`}>{c.ok ? "✓" : "·"}</span>
              <span className={c.ok ? "text-zinc-300" : "text-zinc-500"}>{c.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-semibold text-white">Used across Threadly</p>
        <p className="mt-0.5 text-xs text-zinc-500">Saving this profile updates every app below.</p>
        <ul className="mt-3 space-y-3">
          {BRAND_PROFILE_USES.map((u) => {
            const app = appById(u.app);
            return (
              <li key={u.app}>
                <button type="button" onClick={() => onOpenApp(u.app)} className="group flex w-full gap-3 text-left">
                  <span className={`suite-tile ${app.tile} flex h-7 w-7 shrink-0 items-center justify-center rounded-md`}>{APP_ICONS[u.app]}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-zinc-200 group-hover:text-white">{app.name}</span>
                    <span className="block text-xs leading-snug text-zinc-500">{u.use}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
