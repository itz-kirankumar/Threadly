// AI readiness audit for a domain: can AI assistants and crawlers read the
// site, and does the homepage say clearly what the business is? Each check
// is a plain pass/fail read from robots.txt, llms.txt and the homepage HTML,
// with a fixed weight; the score is the sum of passed weights out of 100.
// It measures readiness, not whether any assistant will cite the site.
// Dependency-free so it is unit-testable in plain node.

export interface AuditInput {
  // From the crawler audit (runOpenSeoAudit).
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  hasLlmsTxt: boolean;
  crawlersBlocked: number;
  crawlersTotal: number;
  // From the homepage fetch; html is "" when it could not be read.
  html: string;
  finalUrl: string;
  status: number;
  ms: number;
}

export interface AuditCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
}

export interface AuditCategory {
  name: string;
  score: number;
  max: number;
  checks: AuditCheck[];
}

export interface SiteAudit {
  score: number;
  grade: "A" | "B" | "C" | "D";
  categories: AuditCategory[];
  passed: number;
  total: number;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const k = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (k === key) return attr(tag, "content");
  }
  return null;
}

function linkHref(html: string, rel: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, "rel") ?? "").toLowerCase().split(/\s+/).includes(rel)) return attr(tag, "href");
  }
  return null;
}

function jsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const blocks = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    for (const m of body.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
      for (const t of m[1].matchAll(/"([^"]+)"/g)) types.push(t[1]);
    }
  }
  return types;
}

const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].toLowerCase());

export function auditSite(input: AuditInput): SiteAudit {
  const { html } = input;
  const read = Boolean(html);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, " ").trim() ?? "";
  const description = metaContent(html, "description") ?? "";
  const h1s = (html.match(/<h1\b/gi) ?? []).length;
  const types = jsonLdTypes(html);
  const links = hrefs(html);
  const has = (re: RegExp) => links.some((l) => re.test(l));
  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] ?? "", "lang");

  const c = (id: string, label: string, weight: number, passed: boolean, detail: string): AuditCheck => ({ id, label, weight, passed, detail });
  const categories: Array<{ name: string; checks: AuditCheck[] }> = [
    {
      name: "AI crawler access",
      checks: [
        c("ai_crawlers", "AI crawlers allowed", 18, input.crawlersBlocked === 0, `${input.crawlersTotal - input.crawlersBlocked} of ${input.crawlersTotal} AI user agents may crawl.`),
        c("robots", "robots.txt published", 4, input.hasRobotsTxt, input.hasRobotsTxt ? "Found." : "Not found."),
        c("sitemap", "Sitemap declared", 5, input.hasSitemap, input.hasSitemap ? "Sitemap: line in robots.txt." : "No Sitemap: line in robots.txt."),
        c("llms", "llms.txt published", 5, input.hasLlmsTxt, input.hasLlmsTxt ? "Found." : "Not found (a proposed convention)."),
      ],
    },
    {
      name: "Technical health",
      checks: [
        c("reachable", "Homepage loads", 6, read && input.status === 200, read ? `Answered ${input.status}.` : `Could not be read${input.status ? ` (${input.status})` : ""}.`),
        c("https", "Served over HTTPS", 4, input.finalUrl.startsWith("https://"), input.finalUrl.startsWith("https://") ? "Yes." : "Ends on plain HTTP."),
        c("speed", "Fast first response", 5, read && input.ms <= 1500, `${input.ms} ms to first byte and redirects.`),
        c("viewport", "Mobile viewport set", 4, Boolean(metaContent(html, "viewport")), metaContent(html, "viewport") ? "Yes." : "No viewport meta tag."),
        c("lang", "Language declared", 3, Boolean(lang), lang ? `lang="${lang}".` : "No lang on <html>."),
      ],
    },
    {
      name: "Content clarity",
      checks: [
        c("title", "Descriptive title", 5, title.length >= 10 && title.length <= 70, title ? `${title.length} characters.` : "No title."),
        c("description", "Meta description", 6, description.length >= 50 && description.length <= 170, description ? `${description.length} characters.` : "No meta description."),
        c("h1", "One main heading", 4, h1s === 1, `${h1s} <h1> tag${h1s === 1 ? "" : "s"}.`),
        c("canonical", "Canonical URL", 3, Boolean(linkHref(html, "canonical")), linkHref(html, "canonical") ? "Set." : "Not set."),
      ],
    },
    {
      name: "Structured data",
      checks: [
        c("jsonld", "Schema.org data present", 8, types.length > 0, types.length ? `Types: ${[...new Set(types)].slice(0, 4).join(", ")}.` : "No JSON-LD found."),
        c("org", "Organization or product described", 5, types.some((t) => /^(Organization|Corporation|LocalBusiness|SoftwareApplication|Product|WebApplication)$/i.test(t)), "Organization, LocalBusiness, Product or SoftwareApplication type."),
        c("og", "Share preview (Open Graph)", 5, Boolean(metaContent(html, "og:title") && metaContent(html, "og:image")), metaContent(html, "og:image") ? "og:title and og:image set." : "Missing og:title or og:image."),
      ],
    },
    {
      name: "Business signals",
      checks: [
        c("pricing", "Pricing page linked", 3, has(/pricing|plans/), has(/pricing|plans/) ? "Linked from the homepage." : "Not linked from the homepage."),
        c("contact", "Contact or demo linked", 3, has(/contact|demo|book|sales/), has(/contact|demo|book|sales/) ? "Linked from the homepage." : "Not linked."),
        c("privacy", "Privacy policy linked", 2, has(/privacy/), has(/privacy/) ? "Linked." : "Not linked."),
        c("social", "Company profiles linked", 2, has(/linkedin\.com\/company|x\.com\/|twitter\.com\//), has(/linkedin\.com\/company|x\.com\/|twitter\.com\//) ? "LinkedIn or X profile linked." : "No LinkedIn or X profile linked."),
      ],
    },
  ];

  const scored = categories.map((cat) => ({
    ...cat,
    max: cat.checks.reduce((s, k) => s + k.weight, 0),
    score: cat.checks.reduce((s, k) => s + (k.passed ? k.weight : 0), 0),
  }));
  const max = scored.reduce((s, k) => s + k.max, 0);
  const score = Math.round((scored.reduce((s, k) => s + k.score, 0) / max) * 100);
  const all = scored.flatMap((k) => k.checks);
  return {
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D",
    categories: scored,
    passed: all.filter((k) => k.passed).length,
    total: all.length,
  };
}

export interface OrganizationFacts {
  founded: string | null;
  location: string | null;
  employees: string | null;
}

// Founded year, location and size, only when the homepage's schema.org data
// states them.
export function organizationFacts(html: string): OrganizationFacts {
  const facts: OrganizationFacts = { founded: null, location: null, employees: null };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) visit(o["@graph"]);
    if (!/Organization|Corporation|LocalBusiness/i.test(String(o["@type"] ?? ""))) return;
    if (!facts.founded && o.foundingDate) facts.founded = String(o.foundingDate).slice(0, 4);
    const raw = Array.isArray(o.address) ? o.address[0] : o.address;
    const address = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const place = [address.addressLocality, address.addressCountry].filter((p) => typeof p === "string" && p).join(", ");
    if (!facts.location && place) facts.location = place;
    const staff = o.numberOfEmployees as { value?: unknown } | number | undefined;
    const size = typeof staff === "object" && staff ? staff.value : staff;
    if (!facts.employees && size) facts.employees = String(size);
  };
  for (const block of html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? []) {
    try {
      visit(JSON.parse(block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "")));
    } catch {
      // Invalid JSON-LD says nothing.
    }
  }
  return facts;
}
