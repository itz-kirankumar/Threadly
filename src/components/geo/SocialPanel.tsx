"use client";

import { useRef, useState } from "react";

type SourceId = "reddit" | "x" | "linkedin" | "web";

interface SocialResult {
  source: SourceId;
  url: string;
  title: string;
  snippet: string;
  published: string | null;
}

interface SocialResponse {
  query: string;
  searchedAt: string;
  results: SocialResult[];
  sourceStatus: Record<string, { count: number; error?: string }>;
  sources: { id: SourceId; label: string; note: string }[];
}

const SOURCE_META: { id: SourceId; label: string }[] = [
  { id: "reddit", label: "Reddit" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "web", label: "Web" },
];

const BADGE: Record<SourceId, string> = {
  reddit: "border-orange-400/30 bg-orange-500/10 text-orange-300",
  x: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  linkedin: "border-blue-400/30 bg-blue-500/10 text-blue-300",
  web: "border-zinc-400/30 bg-white/[0.06] text-zinc-300",
};

function sourceLabel(id: SourceId): string {
  return SOURCE_META.find((s) => s.id === id)?.label ?? id;
}

export default function SocialPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SourceId[]>(["reddit", "x"]);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SocialResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allSelected = selected.length === SOURCE_META.length;

  function toggle(id: SourceId) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function search() {
    if (!query.trim() || !selected.length) return;
    setSearching(true);
    setError("");
    try {
      const data = (await authedFetch("/api/geo/social-search", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), sources: selected }),
      })) as SocialResponse;
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Social search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Social search</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Search public conversations across Reddit, X and LinkedIn, or the wider web. Social results are public
          posts indexed by search - not complete, native or logged-in platform data. Web is a general web search,
          not Google-specific.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && search()}
          placeholder="e.g. best async video tools for agencies"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-400/50 md:min-w-72"
        />
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300 hover:bg-white/[0.08]"
          >
            Sources: {allSelected ? "All" : selected.map(sourceLabel).join(", ") || "none"} ▾
          </button>
          {open && (
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-xl">
              <button
                onClick={() => setSelected(allSelected ? [] : SOURCE_META.map((s) => s.id))}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                <input type="checkbox" readOnly checked={allSelected} className="accent-violet-500" /> All
              </button>
              <div className="my-1 border-t border-white/[0.06]" />
              {SOURCE_META.map((source) => (
                <button
                  key={source.id}
                  onClick={() => toggle(source.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]"
                >
                  <input type="checkbox" readOnly checked={selected.includes(source.id)} className="accent-violet-500" />
                  {source.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={search}
          disabled={searching || !query.trim() || !selected.length}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-40"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
            {result.sources.map((source) => {
              const status = result.sourceStatus[source.id];
              return (
                <span key={source.id} className="rounded-full border border-white/10 px-2.5 py-1" title={source.note}>
                  {source.label}: {status?.error ? "failed" : `${status?.count ?? 0} results`}
                </span>
              );
            })}
          </div>
          {result.results.length === 0 && !Object.values(result.sourceStatus).some((s) => s.error) && (
            <p className="text-sm text-zinc-500">No public results found for this query on the selected sources.</p>
          )}
          <div className="space-y-3">
            {result.results.map((item, index) => (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 hover:border-violet-400/40"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE[item.source]}`}>
                    {sourceLabel(item.source)}
                  </span>
                  {item.published && <span className="text-[11px] text-zinc-600">{item.published.slice(0, 10)}</span>}
                </div>
                <p className="mt-2 text-sm font-medium text-white">{item.title}</p>
                {item.snippet && <p className="mt-1 text-sm text-zinc-500">{item.snippet}</p>}
              </a>
            ))}
          </div>
        </div>
      )}

      {!result && !error && (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">
          Pick sources, type a query, and search public conversations buyers actually have.
        </div>
      )}
    </div>
  );
}
