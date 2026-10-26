// Sanitized provider failure classes. Raw provider error messages are never
// persisted or shown: they can embed provider-side content, and keys must
// never appear in stored records, logs, or UI.
export type ProviderErrorClass =
  | "auth" // 401/403 - key rejected or lacks access
  | "rate_limited" // 429
  | "quota" // provider-side quota/billing exhausted
  | "timeout" // local abort / provider too slow
  | "no_answer" // call succeeded but returned no usable answer
  | "http_4xx" // other client errors (e.g. unknown model)
  | "http_5xx" // provider outage
  | "network" // fetch-level failure
  | "unknown";

export function classifyProviderError(message: string): ProviderErrorClass {
  const m = message.toLowerCase();
  if (/\b401\b|\b403\b|authentication|unauthorized|forbidden|invalid api key|permission/.test(m)) return "auth";
  if (/\b429\b|rate limit|too many requests/.test(m)) return "rate_limited";
  if (/quota|billing|insufficient|credits|exhausted/.test(m)) return "quota";
  if (/timeout|timed out|abort/.test(m)) return "timeout";
  if (/no answer|returned no/.test(m)) return "no_answer";
  if (/\b5\d\d\b/.test(m)) return "http_5xx";
  if (/\b4\d\d\b/.test(m)) return "http_4xx";
  if (/fetch failed|network|econn|enotfound|socket/.test(m)) return "network";
  return "unknown";
}

export const PROVIDER_ERROR_LABELS: Record<ProviderErrorClass, string> = {
  auth: "key rejected",
  rate_limited: "rate limited",
  quota: "quota or billing exhausted",
  timeout: "timed out",
  no_answer: "returned no answer",
  http_4xx: "request rejected",
  http_5xx: "provider outage",
  network: "network error",
  unknown: "unknown error",
};
