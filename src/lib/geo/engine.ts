import { randomUUID } from "node:crypto";
import { PROVIDER_SCANNERS, scanCustomProvider } from "./providers";
import { searchWeb, tavilyConfigured } from "./tavily";
import { decryptSecret } from "./crypto";
import type { KeySettings } from "./store";
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

export interface EffectiveProvider {
  id: GeoProviderId;
  label: string;
  kind: "builtin" | "custom";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

// Effective provider set for one workspace scan: the built-ins (user key
// when saved, else the platform env key) plus the user's custom providers.
export function resolveProviders(settings?: KeySettings | null): EffectiveProvider[] {
  const effective: EffectiveProvider[] = GEO_PROVIDERS.map(({ id, label, envKey }) => {
    const userKey = settings?.providers?.[id];
    return {
      id,
      label,
      kind: "builtin" as const,
      apiKey: userKey ? decryptSecret(userKey.apiKeyEnc) : process.env[envKey],
      model: userKey?.model || undefined,
    };
  });
  for (const custom of Object.values(settings?.custom ?? {})) {
    effective.push({
      id: custom.id,
      label: custom.name,
      kind: "custom",
      apiKey: decryptSecret(custom.apiKeyEnc),
      model: custom.model,
      baseUrl: custom.baseUrl,
    });
  }
  return effective;
}

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

  const providerIds = Object.keys(providerStatus);
  const perProvider = Object.fromEntries(
    providerIds.map((id) => {
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
  keySettings?: KeySettings | null,
  queryIds?: string[],
): Promise<{ run: ScanRun; results: QueryResult[]; snapshot: MetricsSnapshot }> {
  const targets = queryIds?.length ? queries.filter((q) => queryIds.includes(q.id)) : queries;
  if (!targets.length) throw new Error("Add at least one buyer question before running a scan.");
  if (targets.length > MAX_QUERIES_PER_SCAN) {
    throw new Error(`Scan up to ${MAX_QUERIES_PER_SCAN} questions at a time.`);
  }
  const providers = resolveProviders(keySettings);
  const active = providers.filter((p) => Boolean(p.apiKey));
  if (!active.length) {
    throw new Error("No AI provider keys yet. Add your own keys in Settings, or ask the platform admin to configure default keys.");
  }

  const run: ScanRun = {
    id: `run-${randomUUID()}`,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    queryCount: targets.length,
    providerStatus: Object.fromEntries(
      providers.map(({ id }) => [id, active.some((p) => p.id === id) ? "scanned" : "not_configured"]),
    ) as Record<GeoProviderId, ProviderStatus>,
  };

  const jobs = targets.flatMap((query) => providers.map((provider) => ({ query, provider })));
  const cells = await mapWithConcurrency(jobs, CONCURRENCY, async ({ query, provider }) => {
    if (!provider.apiKey) {
      return { queryId: query.id, result: analyzeAnswer(provider.id, "not_configured", null, brand) };
    }
    try {
      const raw = provider.kind === "custom"
        ? await scanCustomProvider(query.text, { apiKey: provider.apiKey, model: provider.model!, baseUrl: provider.baseUrl! })
        : await PROVIDER_SCANNERS[provider.id](query.text, { apiKey: provider.apiKey, model: provider.model });
      return { queryId: query.id, result: analyzeAnswer(provider.id, "scanned", raw, brand) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed.";
      const failed = analyzeAnswer(provider.id, "failed", null, brand, message);
      run.providerStatus[provider.id] = "failed";
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
    results: providers.map(({ id }) => byQuery.get(query.id)!.find((r) => r.provider === id)!),
  }));

  if (tavilyConfigured()) {
    await mapWithConcurrency(targets, 4, async (query) => {
      const webResults = await searchWeb(query.text);
      if (webResults.length) {
        const target = results.find((r) => r.queryId === query.id);
        if (target) target.webResults = webResults;
      }
    });
  }

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
