import type { ReactNode } from "react";
import type { DemoResults } from "@/lib/live-demo/types";

function Block({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-black/[0.08] bg-[#FFFFFF] p-5 ${className}`}>
      <h4 className="text-[11px] font-normal uppercase tracking-[0.14em] text-[#6B6A72]">{title}</h4>
      <div className="mt-3 text-sm text-[#111114]">{children}</div>
    </section>
  );
}

const Empty = () => <p className="text-[#6B6A72]">Nothing found in this run.</p>;

// The finished run as one organised report. Everything comes from `results`,
// the live run on the visitor's site; nothing here is sample data.
export default function ResearchPreview({ results, category }: { results: DemoResults; category: string | null }) {
  const r = results.research;
  if (!r) return null;
  const campaign = results.campaigns?.find((c) => c.selected) ?? results.campaigns?.[0];
  const competitors = results.competitors ?? [];
  const companies = results.companies ?? [];
  const signals = results.social?.leads ?? [];
  const drafts = results.pitch ?? [];
  const sources = [...new Set([`https://${r.domain}/`, ...competitors.map((c) => `https://${c.domain}/`), ...signals.map((s) => s.url)])].slice(0, 8);
  return (
    <section aria-label="Research preview" className="demo-story-in mt-6 rounded-[20px] border border-black/[0.08] bg-[#FFFFFF] p-4 text-left sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-3xl text-[#111114]">Research preview</h3>
        <p className="text-xs text-[#6B6A72]">Read from public sources in this run</p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Block title="Company profile" className="lg:col-span-2">
          <p className="text-lg">{r.name}</p>
          <p className="mt-1 leading-relaxed text-[#6B6A72]">{r.summary}</p>
        </Block>
        <Block title="Industry and target market">
          <p>{category ?? r.keywords[0] ?? "Not stated on the site"}</p>
          {campaign && <p className="mt-1 text-[#6B6A72]">Target: {campaign.name}</p>}
        </Block>
        <Block title="Competitors and similar companies">
          {competitors.length ? <ul className="space-y-1">{competitors.slice(0, 5).map((c) => <li key={c.domain}><a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#5B3DF5]">{c.domain}</a></li>)}</ul> : <Empty />}
        </Block>
        <Block title="Potential customers">
          {companies.length ? <ul className="space-y-1">{companies.slice(0, 5).map((c) => <li key={c.domain}><a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#5B3DF5]">{c.name}</a></li>)}</ul> : <Empty />}
        </Block>
        <Block title="Detected buying signals">
          {signals.length ? <ul className="space-y-2">{signals.slice(0, 3).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:text-[#5B3DF5]">{s.title}</a><span className="text-xs text-[#6B6A72]">{s.platform} · {s.intent}</span></li>)}</ul> : <Empty />}
        </Block>
        <Block title="Relevant opportunities" className="md:col-span-2 lg:col-span-1">
          {drafts.length ? <ul className="space-y-1">{drafts.map((d) => <li key={d.domain}>{d.company}<span className="text-[#6B6A72]"> · first email drafted</span></li>)}</ul> : <Empty />}
        </Block>
        <Block title="Source references" className="md:col-span-2">
          <ul className="grid gap-1 font-mono text-xs text-[#6B6A72] sm:grid-cols-2">
            {sources.map((u) => <li key={u} className="truncate"><a href={u} target="_blank" rel="noopener noreferrer" className="hover:text-[#5B3DF5]">{u.replace(/^https?:\/\/(www\.)?/, "")}</a></li>)}
          </ul>
        </Block>
      </div>
    </section>
  );
}
