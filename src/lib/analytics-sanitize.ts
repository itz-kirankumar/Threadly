// What PostHog is allowed to see: an explicit ALLOWLIST of public
// marketing/content routes. Anything else - unknown, dynamic, auth, payment,
// claim, invite, app, preview, API - is dropped by default, because paths and
// query strings there can carry claim secrets, invite tokens, or order ids.
// Kept pages are reduced to origin + pathname (no query, no hash). Every
// URL-like event property is scrubbed, not only $current_url.
const ALLOWED_EXACT = new Set(["/", "/pricing", "/demo", "/blog", "/docs", "/security", "/privacy", "/terms", "/refund", "/shipping", "/contact"]);
const ALLOWED_PREFIXES = ["/blog/", "/docs/"];
const TOKENISH = /[A-Za-z0-9_-]{20,}/;

export function isAllowedPath(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (ALLOWED_EXACT.has(p)) return true;
  return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix) && p.length > prefix.length);
}

// Returns the URL PostHog may record, or null when the route is not allowlisted.
export function sanitizeTrackedUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!isAllowedPath(url.pathname)) return null;
  return url.origin + url.pathname.replace(/\/+$/, "") || url.origin + "/";
}

function scrubTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return raw.replace(TOKENISH, "[redacted]");
}

function looksLikeUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

// posthog-js before_send hook: returns the event to send, or null to drop it.
export function sanitizeAnalyticsEvent<T extends { properties?: Record<string, unknown> }>(event: T): T | null {
  const properties = event.properties;
  if (!properties) return event;
  // The event's own page must be allowlisted - $current_url first, $pathname as backstop.
  const current = sanitizeTrackedUrl(properties["$current_url"]);
  const pathname = typeof properties["$pathname"] === "string" ? properties["$pathname"] : null;
  if (current === null || (pathname !== null && !isAllowedPath(pathname))) return null;
  properties["$current_url"] = current;
  // Every other URL-like property (referrers, entry/initial/session context):
  // scrub to origin+pathname when allowlisted, delete when not.
  for (const key of Object.keys(properties)) {
    if (key === "$current_url") continue;
    const value = properties[key];
    if (looksLikeUrl(value)) {
      const cleaned = sanitizeTrackedUrl(value);
      if (cleaned === null) delete properties[key];
      else properties[key] = cleaned;
    }
  }
  delete properties["$search"];
  const title = scrubTitle(properties["$title"]);
  if (title === undefined) delete properties["$title"];
  else properties["$title"] = title;
  return event;
}
