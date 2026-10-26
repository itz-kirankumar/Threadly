// What PostHog is allowed to see. Auth/payment/claim/invite/app routes are
// dropped entirely - pageview metrics never need them, and their paths or
// query strings can carry claim secrets, invite tokens, or order ids.
// Everything else is reduced to origin + pathname (no query, no hash).
const SENSITIVE_PATH_PREFIXES = ["/invite", "/checkout", "/portal", "/preview", "/api"];
const TOKENISH = /[A-Za-z0-9_-]{20,}/;

export function isSensitivePath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return SENSITIVE_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

// Returns the URL PostHog may record, or null when the event must be dropped.
export function sanitizeTrackedUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (isSensitivePath(url.pathname)) return null;
  return url.origin + url.pathname;
}

function scrubTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(TOKENISH, "[redacted]");
  return cleaned;
}

// posthog-js before_send hook: returns the event to send, or null to drop it.
export function sanitizeAnalyticsEvent<T extends { properties?: Record<string, unknown> }>(event: T): T | null {
  const properties = event.properties;
  if (!properties) return event;
  const current = sanitizeTrackedUrl(properties["$current_url"]);
  if (current === null) return null; // page itself is sensitive - drop the whole event
  properties["$current_url"] = current;
  for (const prop of ["$initial_current_url", "$referrer", "$initial_referrer"]) {
    if (prop in properties) {
      const cleaned = sanitizeTrackedUrl(properties[prop]);
      if (cleaned === null) delete properties[prop];
      else properties[prop] = cleaned;
    }
  }
  delete properties["$search"];
  const title = scrubTitle(properties["$title"]);
  if (title === undefined) delete properties["$title"];
  else properties["$title"] = title;
  return event;
}
