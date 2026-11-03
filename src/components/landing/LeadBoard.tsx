"use client";

import { useMemo, useState, type ReactNode } from "react";
import { buildLeads, leadsCsv, type LeadKind, type Priority, type ScoredLead } from "@/lib/live-demo/leads";
import type { DemoResults } from "@/lib/live-demo/types";
import { Avatar, MessageFlow, PLATFORM_TONE } from "./demo-tables";

const PRIORITY_STYLE: Record<Priority, string> = {
  Hot: "bg-[#5B3DF5] text-white",
  Warm: "bg-[#EEEBFF] text-[#2F1FA8]",
  Cold: "bg-[#F3F2EE] text-[#4A4950]",
};
const KIND_COLOR: Record<LeadKind, string> = { "Person asking": "#5B3DF5", "Decision maker": "#111114", Company: "#A3A1AB" };

// Map coordinates: fit across, intent up, quadrants split at 50.
const W = 420;
const H = 270;
const X0 = 34;
const Y0 = 236;
const x = (fit: number) => X0 + (fit / 100) * (W - X0 - 14);
const y = (intent: number) => Y0 - (intent / 100) * (Y0 - 14);

// A small, stable offset so leads with the same scores do not hide each other.
function jitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return [((h & 0xff) / 255 - 0.5) * 12, (((h >> 8) & 0xff) / 255 - 0.5) * 12];
}

function picture(lead: ScoredLead): string | null {
  if (lead.photoUrl) return lead.photoUrl;
  const handle = lead.platform === "X" ? lead.profileUrl?.match(/x\.com\/([^/?#]+)/)?.[1] : null;
  return handle ? `https://unavatar.io/x/${handle}?fallback=false` : null;
}

// Every lead in the run, scored and placed on a fit-by-intent map, with the
// list below it best first. Click a dot to find its row; download the list
// as CSV to share it or import it into a CRM.
export default function LeadBoard({ results, action }: { results: DemoResults; action: ReactNode }) {
  const leads = useMemo(() => buildLeads(results), [results]);
  const [filter, setFilter] = useState<"All" | Priority>("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const shown = leads.filter((l) => filter === "All" || l.priority === filter);
  const count = (p: Priority) => leads.filter((l) => l.priority === p).length;

  const download = () => {
    const blob = new Blob([leadsCsv(leads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `threadly-leads-${results.research?.domain ?? "run"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const pick = (id: string) => {
    setSelected(id);
    setFilter("All");
    requestAnimationFrame(() => document.getElementById(`lead-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  if (!leads.length) return <p className="text-sm text-[#6B6A72]">No leads in this run.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["All", "Hot", "Warm", "Cold"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={filter === p} onClick={() => setFilter(p)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === p ? "bg-[#111114] text-white" : "bg-[#F3F2EE] text-[#4A4950] hover:bg-[#EAE9E4]"}`}>
            {p} {p === "All" ? leads.length : count(p)}
          </button>
        ))}
        <button type="button" onClick={download} className="ml-auto rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#111114] hover:border-[#5B3DF5]">
          Download CSV
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <figure className="rounded-2xl border border-black/[0.08] bg-white p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Leads by fit and intent">
            <rect x={x(50)} y={y(100)} width={x(100) - x(50)} height={y(50) - y(100)} fill="#EEEBFF" />
            <line x1={x(50)} y1={y(0)} x2={x(50)} y2={y(100)} stroke="#D9D7D1" strokeDasharray="3 3" />
            <line x1={x(0)} y1={y(50)} x2={x(100)} y2={y(50)} stroke="#D9D7D1" strokeDasharray="3 3" />
            <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(0)} stroke="#B9B7BD" />
            <line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(100)} stroke="#B9B7BD" />
            {[["Act now", x(97), y(96), "end"], ["Watch", x(3), y(96), "start"], ["Nurture", x(97), y(4), "end"], ["Later", x(3), y(4), "start"]].map(([t, tx, ty, anchor]) => (
              <text key={String(t)} x={Number(tx)} y={Number(ty)} textAnchor={anchor as "end" | "start"} fontSize="10" fontWeight="600" fill={t === "Act now" ? "#2F1FA8" : "#9A99A3"} dominantBaseline={Number(ty) < 100 ? "hanging" : "auto"}>{t}</text>
            ))}
            <text x={(x(0) + x(100)) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#6B6A72">Fit: sells to them, names a competitor →</text>
            <text x={10} y={(y(0) + y(100)) / 2} textAnchor="middle" fontSize="10" fill="#6B6A72" transform={`rotate(-90 10 ${(y(0) + y(100)) / 2})`}>Intent: asking, switching, recent →</text>
            {[...leads].reverse().map((l) => {
              const [jx, jy] = jitter(l.id);
              const r = 3.5 + (l.reach / 100) * 3;
              const on = selected === l.id;
              return (
                <circle key={l.id} cx={x(l.fit) + jx} cy={y(l.intent) + jy} r={on ? r + 3 : r} fill={KIND_COLOR[l.kind]} fillOpacity={on ? 1 : 0.8} stroke={on ? "#111114" : "#fff"} strokeWidth={on ? 2 : 1} className="cursor-pointer" onClick={() => pick(l.id)}>
                  <title>{`${l.name}${l.company && l.kind !== "Company" ? `, ${l.company}` : ""}: ${l.score} (${l.priority})`}</title>
                </circle>
              );
            })}
          </svg>
          <figcaption className="mt-1 flex flex-wrap gap-3 text-[11px] text-[#6B6A72]">
            {(Object.keys(KIND_COLOR) as LeadKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />{k}</span>
            ))}
            <span>Bigger dot: a direct way to reach them</span>
          </figcaption>
        </figure>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 text-sm">
          <p className="text-xs font-medium text-[#6B6A72]">How leads are scored</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-[#2B2A31]">
            <li><span className="font-semibold">Fit</span>: names a competitor, is a competitor&apos;s customer, or uses your category&apos;s words.</li>
            <li><span className="font-semibold">Intent</span>: asking for an alternative or a recommendation, how recently; using a competitor today.</li>
            <li><span className="font-semibold">Reach</span>: a direct public profile, or a team page.</li>
            <li className="text-[#6B6A72]">Score = 45% intent, 40% fit, 15% reach. Hot is 75 and up, Warm 55 to 74.</li>
          </ul>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-auto rounded-2xl border border-black/[0.08] bg-white demo-scroll">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>{["Score", "Lead", "Asked or role", "Why", "Found on"].map((h) => <th key={h} className="sticky top-0 z-10 bg-white px-3 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6A72]">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} id={`lead-${l.id}`} className={`align-top transition-colors ${selected === l.id ? "bg-[#F5F3FF]" : "hover:bg-[#F8F7F4]"}`}>
                <td className="border-t border-black/[0.06] px-3 py-3">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLE[l.priority]}`}>{l.priority}</span>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#111114]">{l.score}</p>
                  <p className="text-[10px] tabular-nums text-[#6B6A72]">fit {l.fit} · intent {l.intent}</p>
                </td>
                <td className="border-t border-black/[0.06] px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={l.name} src={picture(l)} size={32} tone={l.platform ? PLATFORM_TONE[l.platform] : KIND_COLOR[l.kind]} />
                    <div className="min-w-0">
                      {l.profileUrl
                        ? <a href={l.profileUrl} target="_blank" rel="noopener noreferrer" className="block max-w-[11rem] truncate font-semibold text-[#111114] hover:text-[#5B3DF5]">{l.name}</a>
                        : <p className="max-w-[11rem] truncate font-semibold">{l.name}</p>}
                      <p className="text-[11px] text-[#6B6A72]">{l.kind}{l.company && l.kind === "Decision maker" ? ` · ${l.company}` : ""}</p>
                    </div>
                  </div>
                </td>
                <td className="border-t border-black/[0.06] px-3 py-3 text-[#2B2A31]">
                  <p className="line-clamp-2 max-w-[16rem]">{l.detail}</p>
                  {(l.sequence || l.reply) && (
                    <button type="button" aria-expanded={open === l.id} onClick={() => setOpen(open === l.id ? null : l.id)} className="mt-1 text-xs font-semibold text-[#5B3DF5]">
                      {open === l.id ? "Hide message flow" : "View message flow"}
                    </button>
                  )}
                  {open === l.id && (
                    <div className="mt-2 max-w-[22rem]">
                      <MessageFlow to={l.name.split(/\s+/)[0]} reply={l.reply} sequence={l.sequence} profileUrl={l.profileUrl ?? l.sourceUrl} openLabel={l.profileUrl ? "Open profile" : "Open the post"} action={action} />
                    </div>
                  )}
                </td>
                <td className="border-t border-black/[0.06] px-3 py-3">
                  <div className="flex max-w-[14rem] flex-wrap gap-1">{l.why.map((w) => <span key={w} className="rounded bg-[#F3F2EE] px-1.5 py-0.5 text-[11px] text-[#2B2A31]">{w}</span>)}</div>
                </td>
                <td className="border-t border-black/[0.06] px-3 py-3 text-xs">
                  {l.sourceUrl ? <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#5B3DF5] hover:underline">{l.source}</a> : l.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
