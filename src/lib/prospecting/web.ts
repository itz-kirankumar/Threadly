import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseAuditDomain, parseRobotsGroups, robotsAllowsPath } from "../geo/openseo-engine.ts";
import { categoryFromPage, companyName as companyNameFrom, decodeEntities, extractPage } from "./text.ts";
import type { PageSnapshot } from "./types.ts";

export const BOT_UA = "ThreadlyBot/1.0 (+https://www.gothreadly.live/security)";
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

export class FetchRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchRefused";
  }
}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:") && privateAddress(v.slice(7));
}

// Public DNS names only, and every resolved address must be public, so a
// typed or redirected URL cannot reach private infrastructure.
export async function assertPublicHost(host: string): Promise<string> {
  const clean = parseAuditDomain(host);
  if (!clean) throw new FetchRefused("not a public hostname");
  const addresses = await lookup(clean, { all: true }).catch(() => []);
  if (!addresses.length) throw new FetchRefused("domain does not resolve");
  if (addresses.some((a) => privateAddress(a.address))) throw new FetchRefused("resolves to a private address");
  return clean;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= MAX_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

async function safeGet(url: string, timeoutMs: number): Promise<{ res: Response; finalUrl: string }> {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:" && current.protocol !== "http:") throw new FetchRefused("unsupported scheme");
    if (current.port && current.port !== "443" && current.port !== "80") throw new FetchRefused("non-standard port");
    await assertPublicHost(current.hostname);
    const res = await fetch(current, {
      headers: { "User-Agent": BOT_UA, Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new FetchRefused(`redirect without location (${res.status})`);
      current = new URL(location, current);
      continue;
    }
    return { res, finalUrl: current.toString() };
  }
  throw new FetchRefused("too many redirects");
}

const robotsCache = new Map<string, { at: number; allowed: (path: string) => boolean }>();

export async function robotsAllows(host: string, path = "/"): Promise<boolean> {
  const cached = robotsCache.get(host);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.allowed(path);
  let allowed: (p: string) => boolean = () => true;
  try {
    const { res } = await safeGet(`https://${host}/robots.txt`, 5000);
    if (res.ok) {
      const groups = parseRobotsGroups((await readCapped(res)).slice(0, 256 * 1024));
      allowed = (p) => robotsAllowsPath(groups, "ThreadlyBot", p) !== "blocked";
    } else {
      await res.body?.cancel().catch(() => {});
    }
  } catch {
    // No reachable robots.txt: crawling is not restricted by it.
  }
  robotsCache.set(host, { at: Date.now(), allowed });
  return allowed(path);
}

// Fetches one public HTML page and extracts its own text. Honors robots.txt
// for ThreadlyBot, caps size and time, never sends cookies or credentials.
export async function fetchPage(domainOrUrl: string, timeoutMs = 8000): Promise<PageSnapshot> {
  const url = /^https?:\/\//i.test(domainOrUrl) ? domainOrUrl : `https://${domainOrUrl}/`;
  const parsed = new URL(url);
  const host = await assertPublicHost(parsed.hostname);
  if (!(await robotsAllows(host, parsed.pathname || "/"))) throw new FetchRefused("robots.txt disallows ThreadlyBot");
  const { res, finalUrl } = await safeGet(url, timeoutMs);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new FetchRefused(`site answered ${res.status}`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|text\/plain/i.test(type)) {
    await res.body?.cancel().catch(() => {});
    throw new FetchRefused("not an HTML page");
  }
  let page = extractPage(await readCapped(res));
  // JavaScript-rendered sites ship almost no text in their HTML. When the
  // owner has configured Firecrawl, its hosted renderer reads the page
  // instead (robots.txt was already checked above).
  if (!page.description && page.paragraphs.length < 2 && process.env.FIRECRAWL_API_KEY) {
    const rendered = await firecrawlPage(finalUrl).catch(() => null);
    if (rendered) page = rendered;
  }
  return {
    url,
    finalUrl,
    domain: new URL(finalUrl).hostname.replace(/^www\./, ""),
    ...page,
    fetchedAt: new Date().toISOString(),
  };
}

async function firecrawlPage(url: string): Promise<ReturnType<typeof extractPage> | null> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { markdown?: string; metadata?: { title?: string; description?: string; ogSiteName?: string } } };
  const md = (body.data?.markdown ?? "").slice(0, 200_000);
  const lines = md.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const strip = (l: string) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#]/g, "").trim();
  const headings = lines.filter((l) => /^#{1,3}\s/.test(l)).map(strip).filter((t) => t.length >= 3 && t.length <= 200).slice(0, 20);
  const paragraphs = lines.filter((l) => !/^#/.test(l)).map(strip).filter((t) => t.length >= 40 && t.length <= 600).slice(0, 15);
  const meta = body.data?.metadata ?? {};
  const links = [...new Set([...md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]))].slice(0, 400);
  return { siteName: meta.ogSiteName ?? null, title: meta.title ?? null, description: meta.description ?? null, headings, paragraphs, links };
}

export interface SitePreview {
  domain: string;
  finalUrl: string;
  name: string;
  description: string | null;
  category: string | null;
  // Small favicon inlined as a data URL, so the visitor's browser never
  // contacts the previewed site.
  iconDataUrl: string | null;
}

const ICON_TYPES = /^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|gif|webp)/i;

async function fetchIcon(url: string): Promise<string | null> {
  try {
    const { res } = await safeGet(url, 4000);
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !ICON_TYPES.test(type)) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 64 * 1024) return null;
    // SVG can carry script; only raster icons are inlined.
    if (/svg/i.test(type)) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// A company's logo for lists: its favicon or touch icon, inlined. One or two
// small requests, same public-host rules; null when neither is available.
export async function fetchSiteIcon(domain: string): Promise<string | null> {
  try {
    await assertPublicHost(domain);
  } catch {
    return null;
  }
  for (const path of ["/favicon.ico", "/apple-touch-icon.png"]) {
    const icon = await fetchIcon(`https://${domain}${path}`);
    if (icon) return icon;
  }
  return null;
}

// Name, description and icon for the type-ahead preview. One page read plus
// at most one small image, with the same public-host and robots.txt rules.
export async function fetchPreview(domain: string): Promise<SitePreview> {
  const url = `https://${domain}/`;
  const host = await assertPublicHost(domain);
  if (!(await robotsAllows(host, "/"))) throw new FetchRefused("robots.txt disallows ThreadlyBot");
  const { res, finalUrl } = await safeGet(url, 6000);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new FetchRefused(`site answered ${res.status}`);
  }
  const html = (await readCapped(res)).slice(0, 300_000);
  const page = extractPage(html);
  const declared = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\brel\s*=\s*["'][^"']*\bicon\b/i.test(tag))
    .map((tag) => tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter((h): h is string => Boolean(h))
    .map((h) => decodeEntities(h))
    .filter((h) => !/\.svg(\?|$)/i.test(h));
  const candidates = [...new Set([...declared, "/favicon.ico"].map((h) => {
    try {
      return new URL(h, finalUrl).toString();
    } catch {
      return "";
    }
  }))].filter((u) => /^https?:/i.test(u)).slice(0, 3);
  let iconDataUrl: string | null = null;
  for (const candidate of candidates) {
    iconDataUrl = await fetchIcon(candidate);
    if (iconDataUrl) break;
  }
  const finalDomain = new URL(finalUrl).hostname.replace(/^www\./, "");
  return {
    domain: finalDomain,
    finalUrl,
    name: companyNameFrom(page, finalDomain),
    description: page.description,
    category: categoryFromPage(page, companyNameFrom(page, finalDomain)),
    iconDataUrl,
  };
}

export interface SearchHit {
  url: string;
  domain: string;
  title: string;
  content: string;
  published: string | null;
}

export function searchAvailable(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function search(query: string, maxResults = 8, options: { includeDomains?: string[]; timeRange?: "month" | "year" } = {}): Promise<SearchHit[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
      ...(options.includeDomains?.length ? { include_domains: options.includeDomains } : {}),
      ...(options.timeRange ? { time_range: options.timeRange } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`search_failed:${response.status}`);
  const payload = (await response.json()) as { results?: Array<{ url?: unknown; title?: unknown; content?: unknown; published_date?: unknown }> };
  return (payload.results ?? [])
    .filter((r): r is { url: string; title?: unknown; content?: unknown; published_date?: unknown } => typeof r?.url === "string")
    .map((r) => {
      let domain = "";
      try {
        domain = new URL(r.url).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        domain = "";
      }
      return {
        url: r.url,
        domain,
        title: typeof r.title === "string" ? r.title : domain,
        content: typeof r.content === "string" ? r.content.slice(0, 1200) : "",
        published: typeof r.published_date === "string" ? r.published_date : null,
      };
    })
    .filter((r) => r.domain);
}

// Runs async work with bounded concurrency, preserving input order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// The homepage's raw HTML plus how it was served, for the readiness audit.
// Same rules as fetchPage: public hosts only, robots.txt respected, capped.
export async function fetchHomepageRaw(domain: string, timeoutMs = 8000): Promise<{ html: string; finalUrl: string; status: number; ms: number }> {
  const host = await assertPublicHost(domain);
  if (!(await robotsAllows(host, "/"))) throw new FetchRefused("robots.txt disallows ThreadlyBot");
  const started = Date.now();
  const { res, finalUrl } = await safeGet(`https://${domain}/`, timeoutMs);
  const ms = Date.now() - started;
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { html: "", finalUrl, status: res.status, ms };
  }
  return { html: await readCapped(res), finalUrl, status: res.status, ms };
}
