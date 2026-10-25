"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceState } from "@/lib/geo/types";

interface CrawlerCheck {
  reachable: boolean;
  verdict?: string;
  note?: string;
  url?: string;
  bots: { bot: string; kind: "search" | "training" | "agent"; blocked: boolean }[];
}

interface Gap {
  queryText: string;
  competitors: string[];
  sources: string[];
}

// Gap analysis: questions where competitors are named but the brand is not -
// the raw material for recommendations (methodology: open-seo ai-visibility-audit).
function buildGaps(state: WorkspaceState): Gap[] {
  if (!state.brand) return [];
  const gaps: Gap[] = [];
  const queryTextById = new Map(state.queries.map((q) => [q.id, q.text]));
  for (const queryResult of state.results) {
    const scanned = queryResult.results.filter((r) => r.status === "scanned");
    if (!scanned.length) continue;
    const brandMentioned = scanned.some((r) => r.brandMentioned);
    if (brandMentioned) continue;
    const competitors = new Set<string>();
    const sources = new Map<string, number>();
    for (const r of scanned) {
      for (const c of r.competitorsMentioned ?? []) competitors.add(c);
      for (const citation of r.citations ?? []) {
        if (citation.domain === state.brand.domain || citation.domain.endsWith(`.${state.brand.domain}`)) continue;
        sources.set(citation.domain, (sources.get(citation.domain) ?? 0) + 1);
      }
    }
    if (competitors.size) {
      gaps.push({
        queryText: queryTextById.get(queryResult.queryId) ?? queryResult.queryId,
        competitors: [...competitors].slice(0, 4),
        sources: [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([domain]) => domain),
      });
    }
  }
  return gaps;
}

export default function RecommendationsPanel({
  state,
  readOnly,
  authedFetch,
}: {
  state: WorkspaceState;
  readOnly: boolean;
  authedFetch: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const gaps = useMemo(() => buildGaps(state), [state]);
  const [crawler, setCrawler] = useState<CrawlerCheck | "loading" | "error" | null>(null);

  useEffect(() => {
    if (readOnly || !state.brand || crawler !== null) return;
    setCrawler("loading");
    authedFetch("/api/geo/crawler-check", { method: "POST", body: "{}" })
      .then((payload) => setCrawler(payload as CrawlerCheck))
      .catch(() => setCrawler("error"));
  }, [authedFetch, crawler, readOnly, state.brand]);

  if (!state.brand) return null;
  if (!gaps.length && !crawler) return null;

  return (
    <div className="rounded-xl border border-white/10">
      <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-sm font-medium text-zinc-300">Recommendations</p>
      </div>
      <div className="space-y-4 p-4">
        {crawler === "loading" && <p className="text-sm text-zinc-500">Checking AI crawler access on {state.brand.domain}...</p>}
        {crawler !== null && crawler !== "loading" && crawler !== "error" && (
          <div className="rounded-lg bg-white/[0.03] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI crawler access - {state.brand.domain}</p>
            {crawler.reachable ? (
              <>
                <p className="mt-1 text-sm text-zinc-300">{crawler.verdict}</p>
                {crawler.bots.some((b) => b.blocked) && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Blocked: {crawler.bots.filter((b) => b.blocked).map((b) => b.bot).join(", ")}. Training-only bots
                    (GPTBot, Google-Extended) affect future models; search bots (OAI-SearchBot, ClaudeBot, PerplexityBot)
                    gate live answers.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-zinc-400">{crawler.note}</p>
            )}
          </div>
        )}
        {gaps.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Visibility gaps - competitors named, you are not ({gaps.length})
            </p>
            <ul className="mt-2 space-y-2">
              {gaps.slice(0, 5).map((gap) => (
                <li key={gap.queryText} className="rounded-lg bg-white/[0.03] p-3 text-sm">
                  <p className="text-zinc-200">&ldquo;{gap.queryText}&rdquo;</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Named instead: <span className="text-amber-200/90">{gap.competitors.join(", ")}</span>
                    {gap.sources.length > 0 && <> · Answers cite: {gap.sources.join(", ")}</>}
                  </p>
                  {gap.sources.length > 0 && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Next step: get listed or reviewed on {gap.sources[0]}, and make sure one of your pages answers this
                      question directly.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
