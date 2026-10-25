import type { GeoProviderId, MetricsSnapshot, ProviderResult, WorkspaceState } from "@/lib/geo/types";

export const PROVIDER_LABELS: Record<GeoProviderId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

export const PROVIDER_ORDER: GeoProviderId[] = ["chatgpt", "claude", "gemini"];

export const PROVIDER_COLORS: Record<GeoProviderId, string> = {
  chatgpt: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  claude: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  gemini: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  perplexity: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function delta(current: number, snapshots: MetricsSnapshot[], key: "mentionRate" | "citationShare" | "shareOfVoice"): number | null {
  if (snapshots.length < 2) return null;
  const previous = snapshots[snapshots.length - 2][key];
  return Math.round((current - previous) * 10) / 10;
}

export interface CitationRow {
  domain: string;
  count: number;
  kind: "brand" | "competitor" | "other";
  exampleUrl: string;
  exampleTitle: string;
}

export function buildCitationLeaderboard(state: WorkspaceState): CitationRow[] {
  if (!state.brand) return [];
  const brandDomain = state.brand.domain;
  const competitorDomains = new Set(state.brand.competitors.map((c) => c.domain));
  const map = new Map<string, CitationRow>();
  for (const queryResult of state.results) {
    for (const result of queryResult.results) {
      if (result.status !== "scanned") continue;
      const seenInCell = new Set<string>();
      for (const citation of result.citations) {
        if (seenInCell.has(citation.domain)) continue;
        seenInCell.add(citation.domain);
        const kind = citation.domain === brandDomain || citation.domain.endsWith(`.${brandDomain}`)
          ? "brand"
          : competitorDomains.has(citation.domain) || [...competitorDomains].some((d) => citation.domain.endsWith(`.${d}`))
            ? "competitor"
            : "other";
        const row = map.get(citation.domain) ?? { domain: citation.domain, count: 0, kind, exampleUrl: citation.url, exampleTitle: citation.title };
        row.count += 1;
        if (kind === "brand") row.kind = "brand";
        else if (kind === "competitor" && row.kind !== "brand") row.kind = "competitor";
        map.set(citation.domain, row);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function cellFor(results: ProviderResult[], provider: GeoProviderId): ProviderResult | undefined {
  return results.find((r) => r.provider === provider);
}

const CUSTOM_COLOR_POOL = [
  "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "bg-lime-500/15 text-lime-300 border-lime-500/30",
  "bg-rose-500/15 text-rose-300 border-rose-500/30",
];

export function colorForProvider(id: GeoProviderId): string {
  if (PROVIDER_COLORS[id]) return PROVIDER_COLORS[id];
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CUSTOM_COLOR_POOL[hash % CUSTOM_COLOR_POOL.length];
}

export function labelForProvider(id: GeoProviderId, labels?: Record<string, string>): string {
  return labels?.[id] ?? PROVIDER_LABELS[id] ?? id.replace(/^custom-/, "").replace(/-/g, " ");
}
