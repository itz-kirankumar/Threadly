import { randomUUID } from "node:crypto";
import { PROVIDER_SCANNERS } from "./providers";
import { analyzeAnswer } from "./extract";
import {
  GEO_PROVIDERS,
  type BrandProfile,
  type GeoProviderId,
  type MetricsSnapshot,
  type ProviderMetrics,
  type ProviderResult,
  type ProviderStatus,
  type QueryResult,
  type ScanRun,
  type TrackedQuery,
} from "./types";

export const MAX_QUERIES_PER_SCAN = 12;
const CONCURRENCY = 8;

export function configuredProviders(): GeoProviderId[] {
  return GEO_PROVIDERS.filter((p) => Boolean(process.env[p.envKey])).map((p) => p.id);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

export function computeSnapshot(
  runId: string,
  results: QueryResult[],
  providerStatus: Record<GeoProviderId, ProviderStatus>,
): MetricsSnapshot {
  const scanned: ProviderResult[] = results.flatMap((r) => r.results).filter((r) => r.status === "scanned");
  const mentioned = scanned.filter((r) => r.brandMentioned);
  const mentionRate = scanned.length ? Math.round((mentioned.length / scanned.length) * 100) : 0;

  const allCitations = scanned.flatMap((r) => r.citations);
  const brandCitationCount = scanned.reduce((sum, r) => sum + r.brandCitationCount, 0);
  const citationShare = allCitations.length ? Math.round((brandCitationCount / allCitations.length) * 100) : 0;

  const brandMentionCount = mentioned.length;
  const competitorMentionCount = scanned.reduce((sum, r) => sum + r.competitorsMentioned.length, 0);
  const voiceTotal = brandMentionCount + competitorMentionCount;
  const shareOfVoice = voiceTotal ? Math.round((brandMentionCount / voiceTotal) * 100) : 0;

  const positions = mentioned.map((r) => r.brandPosition).filter((p): p is number => p !== null);
  const avgPosition = positions.length
    ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
    : null;

  const perProvider = Object.fromEntries(
    GEO_PROVIDERS.map(({ id }) => {
      const cells = results.flatMap((r) => r.results).filter((r) => r.provider === id && r.status === "scanned");
      const cellsMentioned = cells.filter((r) => r.brandMentioned);
      const cellsCitations = cells.flatMap((r) => r.citations);
      const cellsBrandCitations = cells.reduce((sum, r) => sum + r.brandCitationCount, 0);
      const metrics: ProviderMetrics = {
        status: providerStatus[id],
        mentionRate: cells.length ? Math.round((cellsMentioned.length / cells.length) * 100) : 0,
        citationShare: cellsCitations.length ? Math.round((cellsBrandCitations / cellsCitations.length) * 100) : 0,
      };
      return [id, metrics];
    }),
  ) as Record<GeoProviderId, ProviderMetrics>;

  return { runId, date: new Date().toISOString(), mentionRate, citationShare, shareOfVoice, avgPosition, perProvider };
}

export async function runScan(
  brand: BrandProfile,
  queries: TrackedQuery[],
  queryIds?: string[],
): Promise<{ run: ScanRun; results: QueryResult[]; snapshot: MetricsSnapshot }> {
  const targets = queryIds?.length ? queries.filter((q) => queryIds.includes(q.id)) : queries;
  if (!targets.length) throw new Error("Add at least one buyer question before running a scan.");
  if (targets.length > MAX_QUERIES_PER_SCAN) {
    throw new Error(`Scan up to ${MAX_QUERIES_PER_SCAN} questions at a time.`);
  }
  const active = configuredProviders();
  if (!active.length) {
    throw new Error("No AI providers are configured. Add at least one provider API key to the environment.");
  }

  const run: ScanRun = {
    id: `run-${randomUUID()}`,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    queryCount: targets.length,
    providerStatus: Object.fromEntries(
      GEO_PROVIDERS.map(({ id }) => [id, active.includes(id) ? "scanned" : "not_configured"]),
    ) as Record<GeoProviderId, ProviderStatus>,
  };

  const jobs = targets.flatMap((query) => GEO_PROVIDERS.map(({ id }) => ({ query, provider: id })));
  const cells = await mapWithConcurrency(jobs, CONCURRENCY, async ({ query, provider }) => {
    if (!active.includes(provider)) {
      return { queryId: query.id, result: analyzeAnswer(provider, "not_configured", null, brand) };
    }
    try {
      const raw = await PROVIDER_SCANNERS[provider](query.text);
      return { queryId: query.id, result: analyzeAnswer(provider, "scanned", raw, brand) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed.";
      const failed = analyzeAnswer(provider, "failed", null, brand, message);
      run.providerStatus[provider] = "failed";
      return { queryId: query.id, result: failed };
    }
  });

  const byQuery = new Map<string, ProviderResult[]>();
  for (const cell of cells) {
    const list = byQuery.get(cell.queryId) ?? [];
    list.push(cell.result);
    byQuery.set(cell.queryId, list);
  }
  const results: QueryResult[] = targets.map((query) => ({
    queryId: query.id,
    results: GEO_PROVIDERS.map(({ id }) => byQuery.get(query.id)!.find((r) => r.provider === id)!),
  }));

  run.finishedAt = new Date().toISOString();
  const snapshot = computeSnapshot(run.id, results, run.providerStatus);
  return { run, results, snapshot };
}

const INTENT_KEYWORDS: Array<[RegExp, TrackedQuery["intent"]]> = [
  [/best|top|recommend|which|review|pricing|cost|alternative/i, "commercial"],
  [/ vs |versus|compare|comparison|better/i, "comparative"],
];

export function classifyIntent(text: string): TrackedQuery["intent"] {
  for (const [pattern, intent] of INTENT_KEYWORDS) if (pattern.test(text)) return intent;
  return "informational";
}

export function starterQueries(brand: Pick<BrandProfile, "category" | "name">): string[] {
  const category = brand.category.trim() || "software";
  return [
    `What are the best ${category} tools in 2026?`,
    `Best ${category} for startups`,
    `${category} recommendations for a growing team`,
    `Which ${category} product should I choose?`,
    `Top-rated ${category} platforms compared`,
  ];
}
