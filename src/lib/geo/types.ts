// Built-in provider ids are "chatgpt" | "claude" | "gemini";
// user-added custom providers get "custom-*" ids, so the id type is string.
export type GeoProviderId = string;

export const GEO_PROVIDERS: Array<{ id: GeoProviderId; label: string; envKey: string }> = [
  { id: "chatgpt", label: "ChatGPT", envKey: "OPENAI_API_KEY" },
  { id: "claude", label: "Claude", envKey: "ANTHROPIC_API_KEY" },
  { id: "gemini", label: "Gemini", envKey: "GEMINI_API_KEY" },
];

export interface Competitor {
  name: string;
  domain: string;
  aliases: string[];
}

export interface BrandProfile {
  name: string;
  domain: string;
  /** Optional company logo as a small data URL (resized client-side to 128px). */
  logoDataUrl?: string;
  aliases: string[];
  category: string;
  competitors: Competitor[];
  createdAt: string;
  updatedAt: string;
}

export type QueryIntent = "commercial" | "comparative" | "informational";

export interface TrackedQuery {
  id: string;
  text: string;
  intent: QueryIntent;
  createdAt: string;
}

export interface Citation {
  url: string;
  domain: string;
  title: string;
}

export type ProviderStatus = "scanned" | "failed" | "not_configured";

export interface ProviderResult {
  provider: GeoProviderId;
  status: ProviderStatus;
  answer: string;
  citations: Citation[];
  brandMentioned: boolean;
  brandCited: boolean;
  brandCitationCount: number;
  brandPosition: number | null;
  competitorsMentioned: string[];
  competitorsCited: string[];
  error?: string;
  scannedAt: string;
}

export interface QueryResult {
  queryId: string;
  results: ProviderResult[];
}

export interface ScanRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  queryCount: number;
  providerStatus: Record<GeoProviderId, ProviderStatus>;
}

export interface ProviderMetrics {
  status: ProviderStatus;
  mentionRate: number;
  citationShare: number;
}

export interface MetricsSnapshot {
  runId: string;
  date: string;
  mentionRate: number;
  citationShare: number;
  shareOfVoice: number;
  avgPosition: number | null;
  perProvider: Record<GeoProviderId, ProviderMetrics>;
}

export type ProviderKeySource = "user" | "platform" | "none";

export interface ProviderKeyStatus {
  id: GeoProviderId;
  label: string;
  kind: "builtin" | "custom";
  source: ProviderKeySource;
  model?: string;
  baseUrl?: string;
  lastFour?: string;
}

export interface WorkspaceTeamInfo {
  role: "owner" | "admin" | "member";
  shared: boolean;
  teamsEnabled: boolean;
}

export interface WorkspaceState {
  brand: BrandProfile | null;
  queries: TrackedQuery[];
  latestRun: ScanRun | null;
  results: QueryResult[];
  snapshots: MetricsSnapshot[];
  runs: ScanRun[];
  providers: ProviderKeyStatus[];
  team?: WorkspaceTeamInfo;
}
