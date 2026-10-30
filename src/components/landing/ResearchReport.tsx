import type { ReactNode } from "react";
import type { DemoCompany, DemoResults } from "@/lib/live-demo/types";
import CountUp from "./CountUp";

const delay = (i: number) => ({ animationDelay: `${i * 70}ms` });

function Card({ title, children, className = "", index = 0 }: { title: string; children: ReactNode; className?: string; index?: number }) {
  return (
    <section className={`demo-pop-in rounded-2xl border border-black/[0.08] bg-white p-5 ${className}`} style={delay(index)}>
      <h4 className="text-xs font-medium text-[#6B6A72]">{title}</h4>
      <div className="mt-3 text-sm text-[#111114]">{children}</div>
    </section>
  );
}

function Bar({ label, value, max, note }: { label: string; value: number; max: number; note: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
      <span className="truncate">{label}</span>
      <span className="tabular-nums text-[#6B6A72]">{note}</span>
      <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[#F0EFEB]">
        <span className="demo-bar block h-full rounded-full bg-[#5B3DF5]" style={{ ["--bar-to" as string]: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
    </li>
  );
}

function Mini({ company }: { company: DemoCompany }) {
  return (
    <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" title={company.description ?? company.domain} className="flex min-w-0 items-center gap-2 rounded-lg border border-black/[0.07] px-2.5 py-1.5 transition-colors hover:border-[#5B3DF5]/50">
      {company.iconDataUrl
        // eslint-disable-next-line
        ? <img src={company.iconDataUrl} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
        : <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#111114] text-[9px] font-semibold text-white">{company.domain.charAt(0).toUpperCase()}</span>}
      <span className="truncate text-[13px]">{company.domain}</span>
    </a>
  );
}

// Step 9: the finished run as one report. Everything is computed from this
// run's results; nothing here is sample data.
export default function ResearchReport({ results, action }: { results: DemoResults; action: ReactNode }) {
  const r = results.research;
  if (!r) return null;
  const audit = results.crawler;
  const campaign = results.campaigns?.find((c) => c.selected) ?? results.campaigns?.[0];
  const competitors = results.competitors ?? [];
  const companies = results.companies ?? [];
  const signals = results.social?.leads ?? [];
  const drafts = results.pitch ?? [];
  const buyers = signals.filter((s) => s.intent !== "discussing the topic");
  const platforms = (["Reddit", "X", "LinkedIn"] as const).map((p) => ({ name: p, count: signals.filter((s) => s.platform === p).length }));
  const fixes = (audit?.categories ?? []).flatMap((c) => c.checks).filter((c) => !c.passed).sort((a, b) => b.weight - a.weight).slice(0, 3);
  const sources = [...new Set([`https://${r.domain}/`, ...competitors.map((c) => `https://${c.domain}/`), ...companies.map((c) => `https://${c.domain}/`), ...signals.map((s) => s.url)])];
  const moves = [
    buyers.length ? `Reply to the ${buyers.length} ${buyers.length === 1 ? "person" : "people"} publicly asking about this topic.` : null,
    drafts[0] ? `Review the first email to ${drafts[0].company}${drafts[1] ? ` and ${drafts.length - 1} more` : ""}.` : null,
    fixes[0] ? `Fix "${fixes[0].label}" to lift your readiness score by ${fixes[0].weight} points.` : null,
    campaign ? `Start with the ${campaign.name} campaign and look up ${campaign.roles.slice(0, 2).join(" and ")} contacts.` : null,
  ].filter((m): m is string => Boolean(m));
  const kpis: Array<[string, number]> = [["AI readiness", audit?.score ?? 0], ["Competitors", competitors.length], ["Potential customers", companies.length], ["Public posts", signals.length], ["Active buyers", buyers.length]];

  return (
    <div className="space-y-3 pb-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map(([label, value], i) => (
          <div key={label} className={`demo-pop-in rounded-2xl border border-black/[0.08] bg-white p-4 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`} style={delay(i)}>
            <dt className="text-xs text-[#6B6A72]">{label}</dt>
            <dd className="mt-1 text-3xl font-medium tracking-tight text-[#111114]"><CountUp value={value} /></dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Company profile" className="lg:col-span-2" index={5}>
          <p className="text-lg font-medium">{r.name}</p>
          <p className="mt-1 leading-relaxed text-[#6B6A72]">{r.summary}</p>
          {r.keywords.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{r.keywords.slice(0, 6).map((k) => <span key={k} className="rounded-md bg-[#F3F2EE] px-2 py-0.5 text-xs text-[#2B2A31]">{k}</span>)}</div>}
        </Card>
        <Card title="Target market" index={6}>
          <p className="font-medium">{campaign?.name ?? "No audience named"}</p>
          {campaign && <p className="mt-1 text-[#6B6A72]">{campaign.roles.slice(0, 3).join(", ")}</p>}
        </Card>

        <Card title="Next moves" className="lg:col-span-2" index={7}>
          <ol className="space-y-2">
            {moves.map((m, i) => <li key={m} className="flex gap-3"><span className="tabular-nums text-[#5B3DF5]">{i + 1}</span><span>{m}</span></li>)}
          </ol>
          <div className="mt-4">{action}</div>
        </Card>
        <Card title="Where the posts came from" index={8}>
          <ul className="space-y-3">{platforms.map((p) => <Bar key={p.name} label={p.name} value={p.count} max={signals.length} note={String(p.count)} />)}</ul>
        </Card>

        {audit && (
          <Card title="AI readiness breakdown" index={9}>
            <ul className="space-y-3">{audit.categories.map((c) => <Bar key={c.name} label={c.name} value={c.score} max={c.max} note={`${c.score}/${c.max}`} />)}</ul>
          </Card>
        )}
        <Card title="Buying signals" className="lg:col-span-2" index={10}>
          {buyers.length ? (
            <ul className="divide-y divide-black/[0.06]">
              {buyers.slice(0, 4).map((s) => (
                <li key={s.url} className="py-2 first:pt-0 last:pb-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 hover:text-[#5B3DF5]">{s.title}</a>
                  <span className="text-xs text-[#6B6A72]">{s.platform} · {s.intent}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[#6B6A72]">No one was asking directly in this run. Full runs search more widely.</p>}
        </Card>

        <Card title="Competitors" index={11}>
          <div className="grid gap-1.5">{competitors.slice(0, 6).map((c) => <Mini key={c.domain} company={c} />)}</div>
        </Card>
        <Card title="Potential customers" index={12}>
          <div className="grid gap-1.5">{companies.slice(0, 6).map((c) => <Mini key={c.domain} company={c} />)}</div>
        </Card>
        <Card title={`Sources read (${sources.length})`} index={13}>
          <ul className="space-y-1 font-mono text-xs text-[#6B6A72]">
            {sources.slice(0, 8).map((u) => <li key={u} className="truncate"><a href={u} target="_blank" rel="noopener noreferrer" className="hover:text-[#5B3DF5]">{u.replace(/^https?:\/\/(www\.)?/, "")}</a></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
