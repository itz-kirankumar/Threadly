"use client";

import { useState, type ReactNode } from "react";
import type { DemoCompany, DemoSocialLead } from "@/lib/live-demo/types";

export function Logo({ name, icon, size = "h-8 w-8" }: { name: string; icon: string | null | undefined; size?: string }) {
  if (icon) {
    return <img src={icon} alt="" className={`${size} shrink-0 rounded-lg border border-zinc-200 bg-white object-contain p-0.5`} />;
  }
  return (
    <span aria-hidden style={{ background: "#111114", color: "#fff" }} className={`${size} flex shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold`}>
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

// When a post was made: its own date (X and LinkedIn), else the search
// window that found it (Reddit gives search no dates, but the window filters
// by post date).
export function postLabel(lead: Pick<DemoSocialLead, "postedAt" | "window">, now = Date.now()): string {
  if (lead.postedAt) return postedLabel(lead.postedAt, now);
  if (lead.window === "month") return "This month";
  if (lead.window === "year") return "This year";
  return "Undated";
}

// Companies or competitors, one row each. Only facts read in this run: for a
// company, why it is a prospect; for a competitor, how many sources named it.
export function CompanyTable({ list, live = false, showTerms = true }: { list: DemoCompany[]; live?: boolean; showTerms?: boolean }) {
  return (
    <div className="max-h-[52vh] overflow-auto rounded-2xl border border-black/[0.08] bg-white demo-scroll">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead><tr><th className={th}>Company</th><th className={th}>What their homepage says</th><th className={th}>{showTerms ? "Why" : "Named by"}</th></tr></thead>
        <tbody>
          {list.map((c, i) => (
            <tr key={c.domain} className="demo-row-in transition-colors hover:bg-[#F8F7F4]" style={{ animationDelay: live ? "0ms" : `${Math.min(i, 10) * 45}ms` }}>
              <td className={`${td} w-[30%]`}>
                <div className="flex items-center gap-2.5">
                  <Logo name={c.name} icon={c.iconDataUrl} size="h-6 w-6" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#111114]">{c.name}</p>
                    <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-xs text-[#6B6A72] hover:text-[#5B3DF5]">{c.domain}</a>
                    {c.emails?.[0] && <a href={`mailto:${c.emails[0]}`} title="Published on its own homepage" className="block truncate text-xs text-[#5B3DF5] hover:underline">{c.emails[0]}</a>}
                  </div>
                </div>
              </td>
              <td className={`${td} text-[#4A4950]`}><span className="line-clamp-2">{c.description ?? "No description on the homepage."}</span></td>
              <td className={`${td} w-[24%]`}>
                {showTerms ? (
                  <div className="flex flex-wrap gap-1">
                    {c.signal && <span className="rounded bg-[#EEEBFF] px-1.5 py-0.5 text-xs font-medium text-[#2F1FA8]">{c.signal}</span>}
                    {(c.matchedTerms ?? []).slice(0, c.signal ? 2 : 3).map((t) => <span key={t} className="rounded bg-[#F3F2EE] px-1.5 py-0.5 text-xs text-[#2B2A31]">{t}</span>)}
                  </div>
                ) : <span className="text-xs text-[#4A4950]">{c.sources ? `${c.sources} independent source${c.sources === 1 ? "" : "s"}` : "Your brand profile"}</span>}
              </td>
            </tr>
          ))}
          {live && <tr><td colSpan={3} className={`${td} text-xs`}><span className="demo-shimmer">Reading more homepages</span></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// A person's picture: their published photo or avatar, else initials.
export function Avatar({ name, src, size = 36, tone = "#5B3DF5" }: { name: string; src?: string | null; size?: number; tone?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.replace(/^(@|u\/|r\/)/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
  if (src && !failed) {
    return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 rounded-full bg-[#F3F2EE] object-cover" style={{ width: size, height: size }} />;
  }
  return <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, background: tone, color: "#fff", fontSize: Math.round(size * 0.36) }}>{initials}</span>;
}

// The public picture for a post author: an X avatar from the handle; other
// platforms do not expose one without signing in.
export function authorPicture(lead: Pick<DemoSocialLead, "platform" | "author">): string | null {
  return lead.platform === "X" && lead.author?.startsWith("@") ? `https://unavatar.io/x/${lead.author.slice(1)}?fallback=false` : null;
}

export const PLATFORM_TONE: Record<DemoSocialLead["platform"], string> = { Reddit: "#FF4500", X: "#111114", LinkedIn: "#0A66C2", Quora: "#B92B27" };

function Bubble({ label, body, first }: { label: string; body: string; first?: boolean }) {
  return (
    <div className="flex justify-end">
      <div className={`max-w-[92%] rounded-2xl rounded-br-md px-3 py-2 text-xs leading-relaxed ${first ? "bg-[#5B3DF5] text-white" : "bg-white text-[#2B2A31] ring-1 ring-black/[0.07]"}`}>
        <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wider ${first ? "text-white/75" : "text-[#6B6A72]"}`}>{label}</p>
        <p className="whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}

// The message flow for one person: a public reply where there is a post,
// then the first direct message and the follow-ups, as a conversation.
// Drafts for a person to send; nothing is sent from the demo.
export function MessageFlow({ to, reply, sequence, profileUrl, openLabel = "Open profile", action }: { to: string; reply?: string | null; sequence?: { dm: string; followUps: Array<{ day: number; body: string }> } | null; profileUrl?: string | null; openLabel?: string; action?: ReactNode }) {
  return (
    <div className="demo-pop-in space-y-2 rounded-xl bg-[#F3F2EE] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6A72]">Drafts you send from your own account. Nothing is sent from the demo.</p>
      {reply && <Bubble label="Public reply on the post" body={reply} />}
      {sequence && <Bubble first label={`Day 0 · message to ${to}`} body={sequence.dm} />}
      {sequence?.followUps.map((f) => <Bubble key={f.day} label={`Day ${f.day} · follow-up if no reply`} body={f.body} />)}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {profileUrl && <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111114] hover:border-[#5B3DF5]">{openLabel}</a>}
        {action}
      </div>
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
        {(["All", "Reddit", "X", "LinkedIn", "Quora"] as const).map((p) => (
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
                  {l.matched?.length ? <p className="mt-0.5 text-xs text-[#6B6A72]">Mentions {l.matched.slice(0, 3).join(", ")}</p> : null}
                  {(l.reply || l.sequence) && (
                    <button type="button" aria-expanded={open === l.url} onClick={() => setOpen(open === l.url ? null : l.url)} className="mt-1 text-xs font-medium text-[#5B3DF5]">
                      {open === l.url ? "Hide message flow" : l.sequence ? "View message flow" : "View drafted reply"}
                    </button>
                  )}
                  {open === l.url && (l.reply || l.sequence) && (
                    <div className="mt-2">
                      <MessageFlow
                        to={l.authorName ?? (l.platform === "Reddit" ? "the poster" : "the author")}
                        reply={l.reply}
                        sequence={l.sequence}
                        profileUrl={l.profileUrl ?? l.url}
                        openLabel={l.profileUrl ? "Open profile" : "Open the thread to message them"}
                        action={action(true)}
                      />
                    </div>
                  )}
                </td>
                <td className={`${td} text-[#4A4950]`}>
                  <div className="flex items-center gap-2">
                    <Avatar name={l.authorName ?? l.author ?? l.community ?? l.platform} src={authorPicture(l)} size={30} tone={PLATFORM_TONE[l.platform]} />
                    <div className="min-w-0">
                      {l.profileUrl
                        ? <a href={l.profileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-[9rem] truncate text-xs font-semibold text-[#5B3DF5] hover:underline">{l.authorName ?? l.author ?? "Profile"}</a>
                        : l.community?.startsWith("r/")
                          ? <a href={`https://www.reddit.com/${l.community}/`} target="_blank" rel="noopener noreferrer" className="block max-w-[9rem] truncate text-xs font-semibold text-[#5B3DF5] hover:underline">{l.community}</a>
                          : <p className="max-w-[9rem] truncate text-xs text-[#6B6A72]">{l.authorName ?? l.author ?? "Public post"}</p>}
                      <p className="text-[11px] text-[#6B6A72]">{l.platform}</p>
                    </div>
                  </div>
                </td>
                <td className={`${td} text-[#4A4950]`}>{l.intent}</td>
                <td className={`${td} whitespace-nowrap text-[#4A4950]`}>{postLabel(l)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className={`${td} text-[#6B6A72]`}>No recent posts on this platform.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
