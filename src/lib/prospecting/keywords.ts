// Search visibility for the services a site offers, and the keywords to add.
//
// Each service the site names in its own words is searched the way a buyer
// would ask for it ("best interview practice app"). For each search: is the
// site in the top 20, and who is. Phrases the top pages share that the site
// never uses become suggested keywords, each with how many top pages use it.

import type { SearchHit } from "./web.ts";

export interface KeywordCheck {
  query: string;
  // 1-based position of the site's own domain, null when not in the results.
  position: number | null;
  leaders: string[];
}

export interface KeywordReport {
  services: string[];
  checks: KeywordCheck[];
  suggestions: Array<{ phrase: string; pages: number }>;
  searched: number;
}

const STOP = new Set("a an the and or for to of in on with your our you we is are be by from at as it its this that best top free new how what why who get more all any can use using vs one two 2024 2025 2026 2027 review reviews guide list app apps tool tools software platform online".split(" "));

// The services a site names: its category phrases, then its multi-word
// keywords and the product areas it lists.
const FILLER = /\b(link|links|next|message|messages|call|click|page|here|learn|more|now|today|start|sign|login|menu|home)\b/;

export function serviceKeywords(input: { phrases: string[]; keywords: string[]; areas: string[]; related?: string[] }, max = 12): string[] {
  const out: string[] = [];
  for (const k of [...input.phrases, ...input.keywords, ...(input.related ?? []), ...input.areas]) {
    const c = k.toLowerCase().replace(/[^a-z0-9 &+-]/g, " ").replace(/\s+/g, " ").trim();
    // Services are phrases ("interview practice"), not single page words.
    if (c.length < 4 || c.split(" ").length < 2 || c.split(" ").length > 4 || FILLER.test(c) || c.split(" ").every((w) => STOP.has(w))) continue;
    if (!out.some((o) => o === c || o.includes(c))) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

// How a buyer searches for each service.
export function buyerQueries(services: string[], max = 24): string[] {
  const qs: string[] = [];
  for (const s of services) qs.push(`best ${s}`, `${s} recommendations`);
  return [...new Set(qs)].slice(0, max);
}

const rootOf = (d: string) => d.toLowerCase().replace(/^www\./, "");

export function positionOf(hits: Array<Pick<SearchHit, "domain">>, domain: string): number | null {
  const i = hits.findIndex((h) => rootOf(h.domain) === domain || rootOf(h.domain).endsWith(`.${domain}`));
  return i >= 0 ? i + 1 : null;
}

// Two- and three-word phrases shared by several top pages and missing from
// the site's own text.
// Only phrases about the services count: they share a word with them.
export function suggestKeywords(hits: Array<Pick<SearchHit, "title" | "content" | "domain">>, ownText: string, exclude: string[] = [], max = 12): Array<{ phrase: string; pages: number }> {
  const vocabulary = new Set(exclude.flatMap((e) => e.toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/s$/, "")));
  const own = ` ${ownText.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const brands = new Set(hits.map((h) => rootOf(h.domain).split(".")[0]));
  const skip = new Set(exclude.map((e) => e.toLowerCase()));
  const counts = new Map<string, number>();
  for (const h of hits) {
    const words = `${h.title} ${h.content}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
    const seen = new Set<string>();
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (STOP.has(gram[0]) || STOP.has(gram[n - 1]) || gram.some((w) => brands.has(w) || /^\d+$/.test(w) || w.length < 3)) continue;
        seen.add(gram.join(" "));
      }
    }
    for (const g of seen) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .filter(([g, c]) => c >= 3 && !own.includes(` ${g} `) && !skip.has(g) && g.split(" ").some((w) => vocabulary.has(w.replace(/s$/, ""))))
    .sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length);
  const out: Array<{ phrase: string; pages: number }> = [];
  for (const [phrase, pages] of ranked) {
    // "interview practice" and "mock interview practice" are one idea.
    if (out.some((o) => o.phrase.includes(phrase) || phrase.includes(o.phrase))) continue;
    out.push({ phrase, pages });
    if (out.length >= max) break;
  }
  return out;
}

export async function keywordReport(input: { domain: string; phrases: string[]; keywords: string[]; areas: string[]; related?: string[]; ownText: string; search: (q: string, max: number) => Promise<SearchHit[]>; log: (t: string) => void; deadline: number }): Promise<KeywordReport> {
  const services = serviceKeywords(input);
  const queries = buyerQueries(services);
  input.log(`searching ${queries.length} buyer searches for ${services.length} services to see where ${input.domain} shows up`);
  const results = await Promise.all(queries.map(async (query) => {
    if (Date.now() > input.deadline) return { query, hits: [] as SearchHit[] };
    return { query, hits: await input.search(query, 20).catch(() => [] as SearchHit[]) };
  }));
  const checks = results.filter((r) => r.hits.length).map(({ query, hits }) => ({
    query,
    position: positionOf(hits, input.domain),
    leaders: [...new Set(hits.map((h) => rootOf(h.domain)))].filter((d) => d !== input.domain).slice(0, 3),
  }));
  const found = checks.filter((c) => c.position !== null).length;
  input.log(`  in the top 20 for ${found} of ${checks.length} buyer searches`);
  const suggestions = suggestKeywords(results.flatMap((r) => r.hits.filter((h) => rootOf(h.domain) !== input.domain)), input.ownText, services);
  if (suggestions.length) input.log(`  keywords top pages use that the site does not: ${suggestions.slice(0, 5).map((s) => s.phrase).join(", ")}`);
  return { services, checks, suggestions, searched: checks.length };
}
