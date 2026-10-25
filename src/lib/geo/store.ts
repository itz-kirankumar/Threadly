import { readData, writeData } from "@/lib/portal-db";
import type {
  BrandProfile,
  MetricsSnapshot,
  QueryResult,
  ScanRun,
  TrackedQuery,
  WorkspaceState,
} from "./types";

const ROOT = "geo";

function toArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean) as T[];
  if (typeof value === "object") return Object.values(value as Record<string, T>).filter(Boolean);
  return [];
}

export async function loadBrand(): Promise<BrandProfile | null> {
  return readData<BrandProfile>(`${ROOT}/brand`);
}

export async function saveBrand(brand: BrandProfile): Promise<void> {
  await writeData(`${ROOT}/brand`, brand);
}

export async function loadQueries(): Promise<TrackedQuery[]> {
  const queries = toArray<TrackedQuery>(await readData(`${ROOT}/queries`));
  return queries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveQuery(query: TrackedQuery): Promise<void> {
  await writeData(`${ROOT}/queries/${query.id}`, query);
}

export async function deleteQuery(queryId: string): Promise<void> {
  await writeData(`${ROOT}/queries/${queryId}`, null);
}

export async function saveRun(run: ScanRun, results: QueryResult[], snapshot: MetricsSnapshot): Promise<void> {
  await writeData(`${ROOT}/runs/${run.id}`, run);
  const resultMap = Object.fromEntries(results.map((r) => [r.queryId, r]));
  await writeData(`${ROOT}/results/${run.id}`, resultMap);
  await writeData(`${ROOT}/snapshots/${run.id}`, snapshot);
  await writeData(`${ROOT}/latestRun`, run.id);
}

export async function loadWorkspace(): Promise<WorkspaceState> {
  const [brand, queriesRaw, runsRaw, snapshotsRaw, latestRunId] = await Promise.all([
    readData<BrandProfile>(`${ROOT}/brand`),
    readData(`${ROOT}/queries`),
    readData(`${ROOT}/runs`),
    readData(`${ROOT}/snapshots`),
    readData<string>(`${ROOT}/latestRun`),
  ]);
  const runs = toArray<ScanRun>(runsRaw).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const snapshots = toArray<MetricsSnapshot>(snapshotsRaw).sort((a, b) => a.date.localeCompare(b.date));
  let results: QueryResult[] = [];
  let latestRun: ScanRun | null = null;
  if (latestRunId) {
    latestRun = runs.find((run) => run.id === latestRunId) ?? runs[0] ?? null;
    if (latestRun) {
      results = toArray<QueryResult>(await readData(`${ROOT}/results/${latestRun.id}`));
    }
  }
  return {
    brand: brand ?? null,
    queries: toArray<TrackedQuery>(queriesRaw).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    latestRun,
    results,
    snapshots: snapshots.slice(-30),
    runs: runs.slice(0, 20),
    providers: [],
  };
}

// ---- BYOK: per-user provider key settings ----

export interface StoredProviderKey {
  apiKeyEnc: string;
  lastFour: string;
  model?: string;
  updatedAt: string;
}

export interface StoredCustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyEnc: string;
  lastFour: string;
  createdAt: string;
}

export interface KeySettings {
  providers: Record<string, StoredProviderKey>;
  custom: Record<string, StoredCustomProvider>;
}

export async function loadKeySettings(): Promise<KeySettings> {
  const raw = await readData<Partial<KeySettings>>(`${ROOT}/settings/keys`);
  return {
    providers: raw?.providers && typeof raw.providers === "object" ? raw.providers : {},
    custom: raw?.custom && typeof raw.custom === "object" ? raw.custom : {},
  };
}

export async function saveBuiltinKey(providerId: string, record: StoredProviderKey): Promise<void> {
  await writeData(`${ROOT}/settings/keys/providers/${providerId}`, record);
}

export async function deleteBuiltinKey(providerId: string): Promise<void> {
  await writeData(`${ROOT}/settings/keys/providers/${providerId}`, null);
}

export async function saveCustomProvider(record: StoredCustomProvider): Promise<void> {
  await writeData(`${ROOT}/settings/keys/custom/${record.id}`, record);
}

export async function deleteCustomProvider(id: string): Promise<void> {
  await writeData(`${ROOT}/settings/keys/custom/${id}`, null);
}
