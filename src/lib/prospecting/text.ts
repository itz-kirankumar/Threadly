// Pure text helpers: HTML extraction, keyword and audience-phrase mining.
// No network access here, so everything is unit-testable.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "...", middot: "·" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
}

export function clean(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
  return content ? clean(content) || null : null;
}

export interface ExtractedPage {
  siteName: string | null;
  title: string | null;
  description: string | null;
  headings: string[];
  paragraphs: string[];
  // Absolute http(s) link targets found on the page, deduplicated.
  links: string[];
}

// Removes elements marked aria-hidden="true" (decorative or sample content
// such as animated demos), matching nested tags of the same name.
export function stripAriaHidden(html: string): string {
  const open = /<([a-z][a-z0-9]*)\b[^>]*\baria-hidden\s*=\s*["']true["'][^>]*>/gi;
  let out = html;
  for (let guard = 0; guard < 200; guard++) {
    open.lastIndex = 0;
    const m = open.exec(out);
    if (!m) break;
    const tag = m[1].toLowerCase();
    if (m[0].endsWith("/>")) {
      out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
      continue;
    }
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = re.exec(out); t; t = re.exec(out)) {
      depth += t[0][1] === "/" ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    // An unclosed element: drop only its opening tag, never the rest of the page.
    out = out.slice(0, m.index) + " " + out.slice(end === -1 ? m.index + m[0].length : end);
  }
  return out;
}

export function extractPage(rawHtml: string): ExtractedPage {
  const html = stripAriaHidden(
    rawHtml
      .slice(0, 1_500_000)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " "),
  );
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
  const description = metaContent(html, "name", "description") ?? metaContent(html, "property", "og:description");
  const siteName = metaContent(html, "property", "og:site_name");
  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => clean(m[2]))
    .filter((t) => t.length >= 3 && t.length <= 200);
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => clean(m[1]))
    .filter((t) => t.length >= 40 && t.length <= 600);
  return {
    siteName,
    title,
    description,
    headings: [...new Set(headings)].slice(0, 20),
    paragraphs: [...new Set(paragraphs)].slice(0, 15),
    links: [...new Set([...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi)].map((m) => decodeEntities(m[1])))].slice(0, 400),
  };
}

// Root domains a page links out to (excluding its own domain).
export function outboundDomains(links: string[], ownDomain: string): string[] {
  const own = ownDomain.replace(/^www\./, "");
  const out = new Set<string>();
  for (const link of links) {
    try {
      const host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
      if (host && host !== own && !host.endsWith(`.${own}`) && !own.endsWith(`.${host}`)) out.add(host);
    } catch {
      // ignore malformed links
    }
  }
  return [...out];
}

// A readable company name: og:site_name, else the title's leading or trailing
// segment that matches the domain, else the title's first segment.
export function companyName(page: Pick<ExtractedPage, "siteName" | "title">, domain: string): string {
  const split = (t: string) => t.split(/\s+[|\-–—·]\s+|:\s+/).map((p) => p.trim()).filter(Boolean);
  // og:site_name is the best source, but some sites put a tagline in it too
  // ("Wayfront® – Agency Client Portal Software"); keep only the name part.
  const site = page.siteName ? split(page.siteName)[0]?.replace(/[®™]/g, "").trim() : "";
  if (site && site.length <= 40) return site;
  const label = domain.split(".")[0].toLowerCase();
  const parts = split(page.title ?? "").map((p) => p.replace(/[®™]/g, "").trim());
  const byDomain = parts.find((p) => p.toLowerCase().replace(/[^a-z0-9]/g, "").includes(label.replace(/[^a-z0-9]/g, "")));
  const pick = byDomain ?? parts[0];
  if (pick && pick.length <= 60) return pick;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const STOPWORDS = new Set(
  ("a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further get gets got had has have having he her here hers him his how i if in into is it its itself just let me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours " +
    "new best top free one two three use using used make makes made way ways help helps helping work works world today everything anything every much many need needs want get started start learn read more see view find try sign login log demo book contact pricing price home page site website blog news cookie cookies policy privacy terms rights reserved copyright inc ltd llc company team teams platform solution solutions product products service services tool tools app apps software online business businesses customers customer people things thing time year years day days")
    .split(/\s+/),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

// Words too generic to describe what a company does on their own.
const GENERIC = new Set("across share brand brands data based better build built easy fast full great high key leading level like real right simple smart today using within without".split(" "));

// Weighted bigram and unigram frequency over the page's own text, so every
// keyword is traceable to the page. Two-word phrases are preferred; a single
// word is kept only when it is distinctive and not part of a chosen phrase.
export function extractKeywords(page: ExtractedPage, brandName: string, limit = 8): string[] {
  const brand = new Set(tokens(brandName));
  const weighted: Array<[string, number]> = [
    [page.title ?? "", 3],
    [page.description ?? "", 3],
    ...page.headings.map((h) => [h, 2] as [string, number]),
    ...page.paragraphs.map((p) => [p, 1] as [string, number]),
  ];
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  const skip = (w: string) => STOPWORDS.has(w) || brand.has(w);
  for (const [text, w] of weighted) {
    const t = tokens(text);
    for (let i = 0; i < t.length; i++) {
      const a = t[i];
      if (skip(a)) continue;
      if (!GENERIC.has(a)) uni.set(a, (uni.get(a) ?? 0) + w);
      const b = t[i + 1];
      if (b && !skip(b) && !(GENERIC.has(a) && GENERIC.has(b))) bi.set(`${a} ${b}`, (bi.get(`${a} ${b}`) ?? 0) + w);
    }
  }
  const byScore = (m: Map<string, number>, min: number) =>
    [...m.entries()].filter(([, v]) => v >= min).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([k]) => k);
  const out: string[] = [];
  for (const k of byScore(bi, 3)) {
    if (out.length >= Math.max(1, limit - 2)) break;
    if (out.some((o) => o.split(" ").some((w) => k.split(" ").includes(w)))) continue;
    out.push(k);
  }
  for (const k of byScore(uni, 4)) {
    if (out.length >= limit) break;
    if (out.some((o) => o.split(" ").includes(k))) continue;
    out.push(k);
  }
  return out;
}

const AUDIENCE_NOUNS = "teams|companies|agencies|brands|startups|founders|marketers|businesses|enterprises|organizations|organisations|retailers|stores|developers|engineers|leaders|professionals|firms|sellers|creators|publishers|operators|recruiters|clinics|schools|banks|lenders|insurers|manufacturers";

// Audience phrases the company states about itself, e.g. "built for B2B
// marketing teams" -> "B2B marketing teams". Returned with the sentence they
// came from so a campaign can cite it.
export function extractAudiencePhrases(page: ExtractedPage, limit = 6): Array<{ phrase: string; quote: string }> {
  const texts = [page.title ?? "", page.description ?? "", ...page.headings, ...page.paragraphs];
  const re = new RegExp(`\\bfor\\s+((?:[A-Za-z0-9&+/-]+\\s+){0,4}?(?:${AUDIENCE_NOUNS}))\\b`, "gi");
  const seen = new Set<string>();
  const out: Array<{ phrase: string; quote: string }> = [];
  for (const text of texts) {
    for (const m of text.matchAll(re)) {
      const phrase = m[1].replace(/^((the|all|every|any|your|our|modern|today's|most|many|some|other|more|these|those|such)\s+)+/i, "").trim();
      const key = phrase.toLowerCase();
      // A bare audience noun ("teams") says nothing about who the customer is.
      if (phrase.split(/\s+/).length < 2 || seen.has(key)) continue;
      seen.add(key);
      const sentence = text.length <= 220 ? text : text.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + 140).trim();
      out.push({ phrase, quote: sentence });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// What the company does, in its own words: the page-title segment that is not
// the brand name ("Threadly — Enterprise GEO Intelligence" gives "Enterprise
// GEO Intelligence"), else the first heading of reasonable length.
export function categoryFromPage(page: Pick<ExtractedPage, "title" | "headings">, brandName: string): string | null {
  const brand = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isBrand = (s: string) => {
    const k = s.toLowerCase().replace(/[^a-z0-9]/g, "");
    return k === brand || k === "home" || k === "homepage" || (brand.length > 2 && k.startsWith(brand) && k.length - brand.length < 4);
  };
  // A category is a noun phrase ("AI search monitoring"), not page copy
  // that addresses the reader ("What our customers got out of it").
  const sentence = /\b(our|we|you|your|i|my|us|got|get|what|how|why|who)\b/i;
  const usable = (s: string) => {
    const words = s.trim().split(/\s+/);
    return words.length >= 2 && words.length <= 8 && s.length <= 70 && !/[?!]$/.test(s.trim()) && !sentence.test(s);
  };
  const parts = (page.title ?? "").split(/\s+[|\-–—·]\s+|:\s+/).map((p) => p.trim()).filter(Boolean);
  const fromTitle = parts.find((p) => !isBrand(p) && usable(p));
  if (fromTitle) return fromTitle.replace(/^the\s+/i, "");
  const heading = page.headings.find((h) => !isBrand(h) && usable(h));
  return heading ?? null;
}

export function firstSentence(text: string | null | undefined, max = 220): string | null {
  if (!text) return null;
  const s = text.replace(/\s+/g, " ").trim();
  const m = s.match(/^(.{20,}?[.!?])(\s|$)/);
  const out = (m ? m[1] : s).trim();
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}...` : out;
}

export function matchedTerms(text: string, terms: string[]): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  return terms.filter((t) => hay.includes(` ${t.toLowerCase()} `));
}
