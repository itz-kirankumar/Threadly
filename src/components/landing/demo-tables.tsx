"use client";

import { useState, type ReactNode } from "react";
import type { DemoCompany, DemoSocialLead } from "@/lib/live-demo/types";

export function Logo({ name, icon, size = "h-8 w-8" }: { name: string; icon: string | null | undefined; size?: string }) {
  if (icon) {
    return <img src={icon} alt="" className={`${size} shrink-0 rounded-lg border border-zinc-200 bg-white object-contain p-0.5`} />;
  }
  return (
    <span aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[11px] font-semibold text-white`}>
      {name.replace(/^www\./, "").charAt(0).toUpperCase()}
    </span>
  );
}

const th = "sticky top-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6A72]";
const td = "border-t border-black/[0.06] px-4 py-3 align-top";

export function postedLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "Undated";
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

// Companies or competitors, one row each. Only facts read in this run.
export function CompanyTable({ list, live = false, showTerms = true }: { list: DemoCompany[]; live?: boolean; showTerms?: boolean }) {
  return (
    <div className="max-h-[52vh] overflow-auto rounded-2xl border border-black/[0.08] bg-white demo-scroll">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead><tr><th className={th}>Company</th><th className={th}>What their homepage says</th>{showTerms && <th className={th}>Match</th>}</tr></thead>
        <tbody>
          {list.map((c, i) => (
            <tr key={c.domain} className="demo-row-in transition-colors hover:bg-[#F8F7F4]" style={{ animationDelay: live ? "0ms" : `${Math.min(i, 10) * 45}ms` }}>
              <td className={`${td} w-[30%]`}>
                <div className="flex items-center gap-2.5">
                  <Logo name={c.name} icon={c.iconDataUrl} size="h-6 w-6" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#111114]">{c.name}</p>
                    <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-xs text-[#6B6A72] hover:text-[#5B3DF5]">{c.domain}</a>
                  </div>
                </div>
              </td>
              <td className={`${td} text-[#4A4950]`}><span className="line-clamp-2">{c.description ?? "No description on the homepage."}</span></td>
              {showTerms && <td className={`${td} w-[22%]`}><div className="flex flex-wrap gap-1">{(c.matchedTerms ?? []).slice(0, 3).map((t) => <span key={t} className="rounded bg-[#F3F2EE] px-1.5 py-0.5 text-xs text-[#2B2A31]">{t}</span>)}</div></td>}
            </tr>
          ))}
          {live && <tr><td colSpan={showTerms ? 3 : 2} className={`${td} text-xs`}><span className="demo-shimmer">Reading more homepages</span></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Public posts with platform, intent and date, newest evidence visible.
export function SignalTable({ leads, action }: { leads: DemoSocialLead[]; action: (reply: boolean) => ReactNode }) {
  const [filter, setFilter] = useState<"All" | DemoSocialLead["platform"]>("All");
  const [open, setOpen] = useState<string | null>(null);
  const shown = leads.filter((l) => filter === "All" || l.platform === filter);
  const count = (p: "All" | DemoSocialLead["platform"]) => (p === "All" ? leads.length : leads.filter((l) => l.platform === p).length);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by platform">
        {(["All", "Reddit", "X", "LinkedIn"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={filter === p} onClick={() => setFilter(p)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === p ? "bg-[#111114] text-white" : "bg-[#F3F2EE] text-[#4A4950] hover:bg-[#EAE9E4]"}`}>
            {p} {count(p)}
          </button>
        ))}
      </div>
      <div className="max-h-[48vh] overflow-auto rounded-2xl border border-black/[0.08] bg-white demo-scroll">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
          <thead><tr><th className={th}>Post</th><th className={th}>Source</th><th className={th}>Intent</th><th className={th}>Posted</th></tr></thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={l.url} className="demo-row-in" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                <td className={td}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-medium text-[#111114] hover:text-[#5B3DF5]">{l.title}</a>
                  {l.reply && (
                    <button type="button" aria-expanded={open === l.url} onClick={() => setOpen(open === l.url ? null : l.url)} className="mt-1 text-xs font-medium text-[#5B3DF5]">
                      {open === l.url ? "Hide drafted reply" : "View drafted reply"}
                    </button>
                  )}
                  {open === l.url && l.reply && (
                    <div className="demo-pop-in mt-2 rounded-lg bg-[#F3F2EE] p-3">
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#2B2A31]">{l.reply}</p>
                      <div className="mt-2">{action(true)}</div>
                    </div>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-[#4A4950]`}><p>{l.platform}</p><p className="max-w-[9rem] truncate text-xs text-[#6B6A72]">{l.author ?? l.community ?? "Public post"}</p></td>
                <td className={`${td} text-[#4A4950]`}>{l.intent}</td>
                <td className={`${td} whitespace-nowrap text-[#4A4950]`}>{postedLabel(l.postedAt)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className={`${td} text-[#6B6A72]`}>No recent posts on this platform.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
