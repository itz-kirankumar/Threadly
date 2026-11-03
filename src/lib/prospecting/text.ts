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
  // A tagline ("The AI CRM for your entire sales motion") is not a name.
  const tagline = !byDomain && pick && (/^(the|a|an|your|our|how|why)\s/i.test(pick) || pick.split(/\s+/).length >= 5);
  if (pick && pick.length <= 60 && !tagline) return pick;
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

// Runs of adjacent words, split at punctuation and at words too short to
// count, so a pair is only made from words that sat next to each other
// ("Pipeline, by invitation" gives no "pipeline invitation").
function wordRuns(text: string): string[][] {
  return text
    .toLowerCase()
    .split(/[,.;:!?|()[\]{}"“”–—/]+|\s-\s/)
    .flatMap((chunk) => {
      const runs: string[][] = [[]];
      for (const raw of chunk.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
        const w = raw.replace(/^-+|-+$/g, "");
        if (w.length >= 3 && !/^\d+$/.test(w)) runs[runs.length - 1].push(w);
        else if (runs[runs.length - 1].length) runs.push([]);
      }
      return runs.filter((r) => r.length);
    });
}

// Words too generic to describe what a company does on their own.
const GENERIC = new Set("across share brand brands data based better build built easy fast full great high key leading level like real right simple smart today using within without".split(" "));
// Verbs that start page instructions ("build custom", "automate busywork")
// and adverbs that end them ("done faster"): neither makes a theme.
const VERB_START = new Set("accelerate accept automate bring build capture close connect create discover done engage find get grow keep know launch make manage meet reach resolve respond run scale see ship start track triage try turn welcome".split(" "));
const BAD_END = new Set("faster around across together instantly anywhere everywhere better more every today now ready live away".split(" "));
// Words that praise or fill rather than describe; never part of a theme.
const EMPTY = new Set("trusted unique powerful amazing seamless effortless robust innovative incredible millions worldwide life whole first suite welcome beautiful".split(" "));

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
  const skip = (w: string) => STOPWORDS.has(w) || brand.has(w) || EMPTY.has(w);
  for (const [text, w] of weighted) for (const t of wordRuns(text)) {
    for (let i = 0; i < t.length; i++) {
      const a = t[i];
      if (skip(a)) continue;
      if (!GENERIC.has(a)) uni.set(a, (uni.get(a) ?? 0) + w);
      const b = t[i + 1];
      if (b && !skip(b) && !(GENERIC.has(a) && GENERIC.has(b)) && !VERB_START.has(a) && !BAD_END.has(b)) bi.set(`${a} ${b}`, (bi.get(`${a} ${b}`) ?? 0) + w);
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
    if (out.some((o) => o.split(" ").includes(k)) || VERB_START.has(k) || BAD_END.has(k)) continue;
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
      const phrase = m[1].replace(/^((the|all|every|any|your|our|modern|today's|most|many|some|other|more|these|those|such|eligible|selected|qualified|ambitious|innovative|leading|forward-thinking)\s+)+/i, "").trim();
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

// ---- What the company is ---------------------------------------------------
// A category is the noun phrase a site uses to say what it is: "Stripe is a
// financial services platform", "The AI workspace that works for you", "The
// only platform you need for outbound". The phrase must end in a head noun
// such as workspace, CRM or platform; a slogan ("Pipeline, by invitation") or
// an instruction ("Build custom agents") is not a category.

// Heads that only say "a product" and need a qualifier to mean anything.
const GENERIC_HEADS = new Set(["platform", "platforms", "software", "solution", "solutions", "tool", "tools", "toolkit", "app", "apps", "application", "suite", "system", "systems", "service", "services", "product", "products", "company", "provider", "layer", "hub", "os"]);
// Heads that name a category on their own.
const SPECIFIC_HEADS = "workspace|workspaces|crm|erp|cms|ats|hris|lms|cdp|helpdesk|chatbot|copilot|assistant|agent|agents|infrastructure|api|apis|sdk|engine|marketplace|network|database|agency|studio|consultancy|analytics|automation|payments|gateway|processor|bank|wallet|exchange|framework|editor|builder|cloud|tracker|manager|planner|scheduler|desk|browser|ide|intelligence|management|monitoring|base|wiki|payroll|accounting|billing|invoicing|insurance|lending|banking|commerce|ecommerce|checkout|logistics|messaging|prospecting|outreach|outbound|seo|marketing|advertising|recruiting|hiring|security|compliance|observability|search|storage|hosting|dashboard|portal|community";
const HEAD = new RegExp(`^(?:${[...GENERIC_HEADS].join("|")}|${SPECIFIC_HEADS})$`, "i");
// Words that praise rather than describe.
const FLUFF = new Set(["the", "a", "an", "only", "private", "invitation-only", "invite-only", "leading", "modern", "all-in-one", "intelligent", "best", "#1", "no.1", "number", "one", "simple", "powerful", "complete", "comprehensive", "flexible", "easy", "ultimate", "first", "new", "smart", "trusted", "unified", "next-gen", "next-generation", "world's", "worlds", "fastest", "global", "enterprise-grade", "beautiful", "fast", "better", "most", "true", "real", "connected", "free", "open", "secure"]);
const AUDIENCE_END = new RegExp(`\\b(${AUDIENCE_NOUNS}|people|everyone|you|users|customers)$`, "i");

function cleanPhrase(raw: string): string | null {
  const words = raw
    .replace(/[“”"’'()[\]]/g, (m) => (m === "’" || m === "'" ? "'" : " "))
    .replace(/\b(ai)[- ](powered|native|first|driven)\b/gi, "AI")
    .split(/[\s,]+/)
    .filter(Boolean);
  while (words.length && FLUFF.has(words[0].toLowerCase())) words.shift();
  const out = words.join(" ").replace(/\s+-\s+/g, " ").trim();
  if (!out || out.length > 60) return null;
  const n = out.split(/\s+/);
  if (n.length > 6 || !HEAD.test(n[n.length - 1])) return null;
  if (/\b(you|your|we|our|us|i|my)\b/i.test(out)) return null;
  return n.map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ").replace(/\b(ai|crm|erp|cms|ats|hris|lms|cdp|seo|api|sdk|b2b|b2c|saas|llm|geo)\b/g, (m) => m.toUpperCase());
}

// "platform you need for outbound" -> "outbound platform"; a purpose that is
// an audience ("platform for B2B teams") is not part of the category.
function withPurpose(phrase: string, after: string): string {
  const words = phrase.split(" ");
  if (!GENERIC_HEADS.has(words[words.length - 1].toLowerCase()) || words.length > 1) return phrase;
  const m = after.match(/^(?:(?:that\s+)?you\s+need\s+|built\s+|designed\s+|made\s+)?(?:for|to\s+make)\s+([a-z0-9][a-z0-9 &/-]{1,30}?)(?=\s+(?:work|that|to|and|with|from|across|in)\b|[.,|!]|$)/i);
  const purpose = m?.[1]?.trim();
  if (!purpose || AUDIENCE_END.test(purpose) || purpose.split(/\s+/).length > 3 || /\b(you|your|every|all|any)\b/i.test(purpose)) return phrase;
  return `${purpose.toLowerCase()} ${phrase}`;
}

const DEFINITION = /\b(?:is|are)\s+(?:a|an|the)\s+([^.!?]{3,80}?)(?=\s+(?:for|that|which|where|who|to|built|designed|helping|helps|used|trusted|powering|with|on)\b|[.!?;]|$)/gi;
const LEADING = /^(?:the|a|an)\s+([^.!?]{3,60}?)(?=\s+(?:for|that|which|where|you|to|built|designed|helping|with|on)\b|[.!?;]|$)/i;
const NOUN_SEGMENT = /^([A-Za-z][A-Za-z0-9 &-]{2,50}?)(?=\s+(?:for|to|that|which|with)\b|[.,!?]|$)/;

export interface CategoryReading {
  // The site's own category phrase, e.g. "AI workspace".
  category: string | null;
  // Every distinct category phrase found, the first being the category; an
  // "A and B platform" is also split into "A platform" and "B platform".
  phrases: string[];
}

export function categoryPhrases(page: Pick<ExtractedPage, "title" | "description" | "headings" | "paragraphs">, brandName: string): CategoryReading {
  const brand = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const titleParts = (page.title ?? "").split(/\s+[|\-–—·]\s+|:\s+/).map((p) => p.trim()).filter(Boolean);
  const notBrand = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "") !== brand;
  const sentences = (s: string | null | undefined) => (s ?? "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  const found: string[] = [];
  const add = (raw: string | undefined, after = "") => {
    if (!raw) return;
    const p = cleanPhrase(raw);
    if (!p || p.toLowerCase().replace(/[^a-z0-9]/g, "") === brand) return;
    const full = withPurpose(p, after.trim());
    // A bare generic head ("platform") says nothing on its own.
    if (full.split(" ").every((w) => GENERIC_HEADS.has(w.toLowerCase()))) return;
    if (!found.some((f) => f.toLowerCase() === full.toLowerCase())) found.push(full);
  };
  const read = (texts: string[]) => {
    for (const text of texts) {
      for (const m of text.matchAll(DEFINITION)) add(m[1], text.slice((m.index ?? 0) + m[0].length));
      const lead = text.match(LEADING);
      if (lead) add(lead[1], text.slice(lead[0].length));
    }
  };
  read([...sentences(page.description), ...titleParts.filter(notBrand)]);
  // A title segment that is itself a noun phrase: "Financial Infrastructure
  // to Grow Your Revenue" -> "financial infrastructure".
  for (const part of titleParts.filter(notBrand)) {
    const m = part.match(NOUN_SEGMENT);
    if (m) add(m[1], part.slice(m[0].length));
  }
  // Body copy only when the description and title name no category.
  if (!found.length) {
    read([...page.headings.slice(0, 3).flatMap(sentences), ...page.paragraphs.slice(0, 3).flatMap(sentences)]);
    for (const heading of page.headings.slice(0, 2)) {
      const m = heading.match(NOUN_SEGMENT);
      if (m) add(m[1], heading.slice(m[0].length));
    }
  }
  const phrases = [...found];
  for (const p of found) {
    const words = p.split(" ");
    const head = words[words.length - 1];
    const body = words.slice(0, -1).join(" ");
    if (/\s(and|&)\s/.test(body)) {
      for (const part of body.split(/\s+(?:and|&)\s+/)) {
        const sub = `${part.trim()} ${head}`;
        if (part.trim() && !phrases.includes(sub)) phrases.push(sub);
      }
    }
  }
  return { category: found[0] ?? null, phrases: phrases.slice(0, 6) };
}

// Business functions and product kinds a site lists for itself: "business
// applications across sales, marketing, support, finance, HR" or "including
// CRM, Mail and Desk". For a suite these say more than its category phrase.
const AREA_WORDS = new Set(["crm", "erp", "hr", "hrms", "hris", "payroll", "accounting", "finance", "invoicing", "billing", "expenses", "sales", "marketing", "support", "help desk", "helpdesk", "customer service", "customer support", "analytics", "bi", "project management", "collaboration", "email", "email marketing", "recruiting", "recruitment", "inventory", "ecommerce", "e-commerce", "payments", "security", "it", "it service management", "itsm", "devops", "observability", "knowledge base", "wiki", "docs", "chat", "video", "forms", "surveys", "low-code", "app development", "custom app development", "procurement", "supply chain", "logistics", "operations", "legal", "compliance", "contracts", "scheduling", "booking", "telephony", "voip", "call center", "contact center", "social media", "seo", "advertising", "web analytics", "product analytics", "data", "automation", "workflow automation"]);
const AREA_LIST = /\b(?:across|including|includes|include|covering|spanning|such as|from)\s+([^.;:!?]{3,220})/gi;

export function categoryAreas(page: Pick<ExtractedPage, "title" | "description" | "headings" | "paragraphs">, keywords: string[] = []): string[] {
  const out = new Set<string>();
  for (const k of keywords) if (AREA_WORDS.has(k.toLowerCase())) out.add(k.toLowerCase());
  for (const text of [page.description ?? "", page.title ?? "", ...page.headings.slice(0, 4), ...page.paragraphs.slice(0, 3)]) {
    for (const m of text.matchAll(AREA_LIST)) {
      // "across sales, marketing, including CRM, Desk" is two lists.
      for (const raw of m[1].split(/,|\band\b|\bor\b|\bto\b|&|\/|\b(?:across|including|includes|include|covering|spanning|such as|from)\b/i)) {
        const item = raw.toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
        if (AREA_WORDS.has(item)) out.add(item);
      }
    }
  }
  return [...out].slice(0, 12);
}

// The category phrases worth searching: the parts of "A and B platform"
// before the combined phrase, and phrases built from the main category's
// own words before any others.
export function searchTopics(phrases: string[]): string[] {
  const main = phrases[0]?.toLowerCase() ?? "";
  const mainWords = new Set(main.split(/\s+/));
  const single = phrases.filter((p) => !/\s(and|&)\s/i.test(p));
  const fromMain = (p: string) => p.toLowerCase().split(/\s+/).every((w) => mainWords.has(w));
  return [...single.filter(fromMain), ...single.filter((p) => !fromMain(p))];
}

// Synonyms buyers use for common categories, so a post asking for "a cold
// email tool" matches an outbound platform and "Confluence" pages count as
// a wiki. Keys and values are lower case.
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/\bworkspace|wiki|knowledge base|docs\b/, ["workspace", "wiki", "knowledge base", "note-taking", "notes app", "docs", "project management"]],
  [/\bcrm\b/, ["crm", "customer relationship", "sales pipeline", "deal tracking"]],
  [/\bprospecting|lead generation|sales intelligence\b/, ["prospecting", "lead generation", "lead gen", "sales intelligence", "b2b data", "contact data", "buying signals", "intent data", "outbound"]],
  [/\boutbound|outreach|cold email|sales engagement\b/, ["outbound", "cold email", "cold outreach", "outreach", "sales engagement", "email sequences", "lead generation"]],
  [/\bai visibility|ai search|generative engine|\bgeo\b|llm visibility|ai seo\b/, ["ai visibility", "ai search", "generative engine optimization", "geo", "llm visibility", "ai seo", "chatgpt visibility", "answer engine"]],
  [/\bpayments?|payment processing|financial infrastructure|financial services|checkout\b/, ["payments", "payment processing", "payment gateway", "online payments", "checkout", "billing", "merchant"]],
  [/\bhelpdesk|help desk|customer support|support desk\b/, ["helpdesk", "help desk", "customer support", "ticketing", "support tickets"]],
  [/\bproject management|work management|task management\b/, ["project management", "work management", "task management", "kanban"]],
  [/\banalytics|product analytics\b/, ["analytics", "product analytics", "dashboards", "event tracking"]],
  [/\bseo\b/, ["seo", "search engine optimization", "rank tracking", "keyword research"]],
  [/\bpayroll|hris|\bhr\b/, ["payroll", "hris", "hr software", "people ops"]],
  [/\brecruiting|hiring|\bats\b/, ["recruiting", "applicant tracking", "ats", "hiring"]],
  [/\baccounting|invoicing|bookkeeping\b/, ["accounting", "invoicing", "bookkeeping"]],
  [/\becommerce|commerce|storefront\b/, ["ecommerce", "online store", "storefront"]],
  [/\bobservability|monitoring\b/, ["observability", "monitoring", "logging", "apm"]],
  [/\bsecurity|compliance\b/, ["security", "compliance", "soc 2"]],
  [/\bscheduling|scheduler|calendar\b/, ["scheduling", "booking", "calendar"]],
  [/\bchatbot|ai agent|agents?\b/, ["chatbot", "ai agent", "ai agents", "customer service ai"]],
  [/\berp\b|business software|business applications|business suite/, ["erp", "business software", "business applications", "all-in-one business"]],
];

// Category words too broad to match on alone ("cloud software suite" says
// cloud; "financial services platform" says financial).
const BROAD = new Set(["cloud", "software", "business", "digital", "online", "data", "enterprise", "modern", "financial", "intelligent", "integrated", "custom", "web", "mobile", "smart", "global"]);

// The words that say what a company does, from its category phrases:
// "AI visibility platform" -> "ai visibility" (generic heads dropped), and
// the synonyms buyers use for the same category. Lower case, longest first.
export function categoryTerms(phrases: string[], areas: string[] = []): { primary: string[]; related: string[] } {
  const primary = new Set<string>();
  const related = new Set<string>();
  for (const p of phrases) {
    const all = p.toLowerCase().split(/\s+/).filter((w) => !GENERIC_HEADS.has(w) && !FLUFF.has(w));
    for (const [re, syns] of SYNONYMS) if (re.test(p.toLowerCase())) for (const s of syns) related.add(s);
    const words = all.every((w) => BROAD.has(w)) ? [] : all;
    if (!words.length) continue;
    const body = words.join(" ").replace(/\s+(and|&)\s+/g, " ");
    if (body.length >= 3 && !/\s(and|&)\s/.test(words.join(" "))) primary.add(body);
    const last = words[words.length - 1];
    if (new RegExp(`^(?:${SPECIFIC_HEADS})$`).test(last) && last.length >= 3 && !WEAK_HEADS.has(last)) primary.add(last);
  }
  for (const a of areas) {
    related.add(a);
    for (const [re, syns] of SYNONYMS) if (re.test(a)) for (const s of syns) related.add(s);
  }
  for (const p of primary) related.delete(p);
  const longestFirst = (set: Set<string>) => [...set].sort((a, b) => b.length - a.length);
  return { primary: longestFirst(primary), related: longestFirst(related) };
}

// Heads too broad to stand alone as a match ("infrastructure", "agent").
const WEAK_HEADS = new Set(["agent", "agents", "assistant", "engine", "base", "management", "intelligence", "search", "network", "cloud", "desk", "dashboard", "portal", "community", "builder", "editor", "manager", "framework", "studio", "infrastructure", "api", "apis", "sdk", "automation", "hosting", "storage", "security"]);

export function coreTerms(phrases: string[]): string[] {
  const { primary, related } = categoryTerms(phrases);
  return [...primary, ...related];
}

// Whole-word occurrences of terms in text, case-insensitive.
export function termsIn(text: string, terms: string[]): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9.\s-]/g, " ").replace(/\s+/g, " ")} `;
  return terms.filter((t) => hay.includes(` ${t} `) || hay.includes(` ${t}s `) || hay.includes(` ${t}. `));
}

// What the company does, in its own words: its category phrase ("Stripe is a
// financial services platform"), else the page-title segment that is not the
// brand name ("Threadly — Enterprise GEO Intelligence" gives "Enterprise GEO
// Intelligence"), else the first heading of reasonable length.
export function categoryFromPage(page: Pick<ExtractedPage, "title" | "headings"> & Partial<Pick<ExtractedPage, "description" | "paragraphs">>, brandName: string): string | null {
  const read = categoryPhrases({ title: page.title, headings: page.headings, description: page.description ?? null, paragraphs: page.paragraphs ?? [] }, brandName);
  if (read.category) return read.category;
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
