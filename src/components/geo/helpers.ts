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
      for (const citation of result.citations ?? []) {
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

// ---- Competitive intelligence derivations (all computed from real scan data) ----

export type SourceType = "ugc" | "reference" | "editorial";

const UGC_DOMAINS = [
  "reddit.com", "quora.com", "youtube.com", "stackoverflow.com", "stackexchange.com",
  "x.com", "twitter.com", "facebook.com", "tiktok.com", "instagram.com", "linkedin.com",
  "medium.com", "discord.com", "news.ycombinator.com", "producthunt.com",
];

const REFERENCE_DOMAINS = [
  "wikipedia.org", "investopedia.com", "britannica.com", "crunchbase.com", "wikidata.org",
];

export function classifySourceDomain(domain: string): SourceType {
  const d = domain.toLowerCase();
  if (UGC_DOMAINS.some((u) => d === u || d.endsWith(`.${u}`))) return "ugc";
  if (REFERENCE_DOMAINS.some((r) => d === r || d.endsWith(`.${r}`))) return "reference";
  if (/\.gov(\.|$)|\.edu(\.|$)/.test(d)) return "reference";
  return "editorial";
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  ugc: "UGC",
  reference: "Reference",
  editorial: "Editorial",
};

export interface CompetitorRow {
  name: string;
  domain: string;
  isBrand: boolean;
  visibility: number; // % of scanned answers mentioning the brand
  mentioned: number;
  total: number;
  citationCount: number; // answers citing the domain
}

export function buildCompetitorComparison(state: WorkspaceState): CompetitorRow[] {
  if (!state.brand) return [];
  const scanned = state.results.flatMap((queryResult) =>
    queryResult.results.filter((result) => result.status === "scanned"),
  );
  const total = scanned.length;
  if (!total) return [];

  const countCitations = (domain: string) =>
    scanned.reduce(
      (acc, result) => acc + ((result.citations ?? []).some((c) => c.domain === domain || c.domain.endsWith(`.${domain}`)) ? 1 : 0),
      0,
    );

  const brandMentioned = scanned.filter((r) => r.brandMentioned).length;
  const rows: CompetitorRow[] = [
    {
      name: state.brand.name,
      domain: state.brand.domain,
      isBrand: true,
      mentioned: brandMentioned,
      total,
      visibility: Math.round((brandMentioned / total) * 1000) / 10,
      citationCount: countCitations(state.brand.domain),
    },
  ];

  for (const competitor of state.brand.competitors) {
    const aliases = [competitor.name, ...(competitor.aliases ?? [])].map((n) => n.toLowerCase());
    const mentioned = scanned.filter((result) => {
      const names = (result.competitorsMentioned ?? []).map((m) => m.toLowerCase());
      return names.some((name) => aliases.includes(name)) ||
        aliases.some((alias) => names.some((m) => m.includes(alias) || alias.includes(m)));
    }).length;
    rows.push({
      name: competitor.name,
      domain: competitor.domain,
      isBrand: false,
      mentioned,
      total,
      visibility: Math.round((mentioned / total) * 1000) / 10,
      citationCount: countCitations(competitor.domain),
    });
  }
  return rows.sort((a, b) => b.visibility - a.visibility || b.citationCount - a.citationCount);
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
