import { randomUUID } from "node:crypto";
import type { BrandProfile } from "../geo/types.ts";
import { contactProvider } from "./contacts.ts";
import { modelEnabled, modelJson } from "./model.ts";
import { findDecisionMakers } from "./people.ts";
import { draftCompanyEmail } from "./social.ts";
import { categoryAreas, categoryPhrases, categoryTerms, companyName, decodeEntities, extractAudiencePhrases, extractKeywords, firstSentence, matchedTerms, outboundDomains, searchTopics, termsIn } from "./text.ts";
import type { Campaign, Competitor, Evidence, ProspectCompany, ProspectContact, ProspectingState, EmailDraft, Research, StepId } from "./types.ts";
import { FetchRefused, fetchHtml, fetchPage, mapLimit, search, searchAvailable, type SearchHit } from "./web.ts";

export interface StepContext {
  brand: BrandProfile;
  senderName: string;
  log: (text: string) => void;
  // Epoch milliseconds after which a step stops starting new page reads
  // and returns what it has; unset means no deadline.
  deadline?: number;
}

const pastDeadline = (ctx: StepContext) => ctx.deadline !== undefined && Date.now() > ctx.deadline;

export class StepBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepBlocked";
  }
}

// Publishers, directories, communities and platforms: they rank for every
// query but are not prospects or competitors.
const NON_COMPANY = [
  "g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustradius.com", "producthunt.com", "crunchbase.com", "linkedin.com",
  "reddit.com", "quora.com", "medium.com", "substack.com", "youtube.com", "x.com", "twitter.com", "facebook.com", "instagram.com",
  "tiktok.com", "wikipedia.org", "github.com", "forbes.com", "techcrunch.com", "businessinsider.com",
  "searchengineland.com", "searchenginejournal.com", "gartner.com", "clutch.co", "upwork.com",
  "fiverr.com", "indeed.com", "glassdoor.com", "apple.com", "google.com", "microsoft.com", "amazon.com", "wordpress.com", "wix.com",
  "shopify.com", "news.ycombinator.com", "ycombinator.com", "slashdot.org", "alternativeto.net", "saashub.com", "stackshare.io",
  "builtwith.com", "similarweb.com", "statista.com", "nytimes.com", "theverge.com", "wired.com", "venturebeat.com", "inc.com",
  "yahoo.com", "investing.com", "bloomberg.com", "reuters.com", "cnbc.com", "libhunt.com", "tracxn.com",
  "cbinsights.com", "pitchbook.com", "owler.com", "craft.co", "f6s.com", "wellfound.com", "angel.co",
  "dealroom.co", "growjo.com", "getlatka.com", "prnewswire.com",
  "businesswire.com", "globenewswire.com", "eventbrite.com", "meetup.com", "coursera.org", "udemy.com",
  // Messaging and link hosts that pages link to, never prospects.
  "t.me", "telegram.org", "telegram.me", "wa.me", "whatsapp.com", "discord.gg", "discord.com", "linktr.ee", "bio.link",
  "trustpilot.com", "sourceforge.net", "softonic.com", "goodfirms.co", "findalternate.com", "noteapps.info",
];

// Contact-data vendors publish a profile page for every company, so their
// pages are never prospects; their homepages can still be competitors of a
// prospecting product.
const PROFILE_SITES = ["zoominfo.com", "lusha.com", "signalhire.com", "leadiq.com", "rocketreach.co", "contactout.com"];

function isProfileSite(domain: string): boolean {
  return PROFILE_SITES.some((d) => domain === d || domain.endsWith(`.${d}`));
}

const MAX_COMPETITORS = 15;
const MAX_COMPANIES_PER_CAMPAIGN = 25;

function now(): string {
  return new Date().toISOString();
}

// The registrable domain a company is known by: academy.intercom.com and
// developers.intercom.com are both intercom.com; example.co.uk keeps three
// labels.
export function rootDomain(domain: string): string {
  const host = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/:?#].*$/, "");
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const sld = labels[labels.length - 2];
  const tld = labels[labels.length - 1];
  const keep = tld.length === 2 && /^(co|com|org|net|ac|gov|edu|ltd|plc)$/.test(sld) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

// CDNs, ad and tracking hosts appear as links on article pages.
const INFRASTRUCTURE = /(^|\.)(yimg\.com|oath\.com|yahoo\.com|aol\.com|gstatic\.com|googleusercontent\.com|googleapis\.com|googletagmanager\.com|doubleclick\.net|cloudfront\.net|akamaihd\.net|akamaized\.net|fastly\.net|jsdelivr\.net|unpkg\.com|gravatar\.com|wp\.com|bit\.ly|t\.co|lnkd\.in|apple\.co|amzn\.to|feedburner\.com|disqus\.com|typekit\.net|hotjar\.com|hs-scripts\.com|hubspotusercontent[a-z0-9-]*\.net)$|(^|\.)(cdn|static|assets|img|images|media)\d*\./;

const LIST_TITLE = /\b(top|best|\d+|list|lists|startups|companies|brands|agencies|vendors|directory|examples|leading)\b/i;

// Free hosting and publisher-style names are not prospects.
const HOSTED = /(^|\.)(github\.io|gitlab\.io|vercel\.app|netlify\.app|herokuapp\.com|pages\.dev|web\.app|firebaseapp\.com|blogspot\.com|notion\.site|webflow\.io|framer\.website|carrd\.co|wixsite\.com|squarespace\.com)$/;
const PUBLISHER = /^(?:[a-z0-9-]*-)?(news|magazine|journal|media|times|post|daily|weekly|insider|tribune|gazette|herald|wire|digest|review|today|world|report|blog|wiki|marketcap)(?:-[a-z0-9-]*)?$|(news|magazine|journal|insider|tribune|gazette|digest|marketcap|wiki)/;

function isNonCompany(domain: string): boolean {
  const label = domain.split(".")[0];
  return NON_COMPANY.some((d) => domain === d || domain.endsWith(`.${d}`))
    || /(^|\.)(gov|edu|mil)(\.[a-z]{2})?$/.test(domain)
    || HOSTED.test(domain)
    || PUBLISHER.test(label)
    || /.(media|world|hub|list|lists|topics|ranking|rankings|directory|startups|companies)$/.test(label)
    || INFRASTRUCTURE.test(domain);
}

// Titles of interstitial pages (redirects, bot checks, errors) are not names.
const INTERSTITIAL = /^(redirecting|just a moment|attention required|access denied|forbidden|not found|404|403|error|page not found|loading|please wait|one moment|security check|captcha|are you a robot)/i;

// A homepage is on topic when it mentions a whole topic phrase, or at least
// two distinct topic words; one generic word ("revenue") is not enough.
export function onTopic(text: string, terms: string[]): string[] {
  const hits = matchedTerms(text, terms);
  const phrases = hits.filter((h) => h.includes(" "));
  const words = new Set(hits.filter((h) => !h.includes(" ")));
  return phrases.length || words.size >= 2 ? hits : [];
}

function isHomepage(url: string): boolean {
  try {
    // The site root, or a locale root such as /en or /en-gb.
    const p = new URL(url).pathname.replace(/\/+$/, "").toLowerCase();
    return p === "" || /^\/[a-z]{2}(-[a-z]{2})?$/.test(p);
  } catch {
    return false;
  }
}

function describeError(error: unknown): string {
  if (error instanceof FetchRefused) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "timed out";
  return "could not be reached";
}

// Downstream steps depend on upstream results; re-running a step clears them.
export function clearAfter(state: ProspectingState, step: StepId): ProspectingState {
  const order: StepId[] = ["research", "competitors", "campaigns", "companies", "contacts", "emails"];
  const next = { ...state };
  for (const later of order.slice(order.indexOf(step) + 1)) {
    delete next[later];
    if (next.logs) next.logs = { ...next.logs, [later]: undefined };
  }
  return next;
}

// ---- Step 1: research ------------------------------------------------------
export async function runResearch(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const domain = rootDomain(ctx.brand.domain);
  ctx.log(`fetching https://${domain}/`);
  let page = null;
  let pageError: string | null = null;
  try {
    page = await fetchPage(domain);
    ctx.log(`read ${page.headings.length} headings and ${page.paragraphs.length} paragraphs from ${page.finalUrl}`);
  } catch (error) {
    pageError = describeError(error);
    ctx.log(`homepage ${pageError}; using the brand profile only`);
  }

  const keywords = page ? extractKeywords(page, ctx.brand.name) : [];
  const audiences = page ? extractAudiencePhrases(page) : [];
  const reading = page ? categoryPhrases(page, ctx.brand.name) : { category: null, phrases: [] };
  const category = reading.category ?? (ctx.brand.category.trim() || null);
  if (page) ctx.log(`extracted ${keywords.length} keywords and ${audiences.length} audience phrases from the page text`);
  ctx.log(category ? `reads as: ${category}${reading.phrases.length > 1 ? ` (also ${reading.phrases.slice(1, 3).join(", ")})` : ""}` : "the homepage does not say what kind of product it is in one phrase; using its keywords");

  let summary = page?.description ?? firstSentence(page?.paragraphs[0]) ?? "";
  let summarySource: "homepage" | "model" | "profile" = summary ? "homepage" : "profile";
  if (!summary) summary = ctx.brand.category ? `${ctx.brand.name} operates in ${ctx.brand.category}.` : `${ctx.brand.name} at ${domain}.`;

  if (page && modelEnabled()) {
    ctx.log("summarising the homepage text with the model");
    const out = await modelJson<{ summary?: string }>(
      'Summarise what this company sells and to whom in two or three sentences. Shape: {"summary": string}',
      { homepage: [page.title, page.description, ...page.headings, ...page.paragraphs].filter(Boolean).join("\n") },
    );
    if (out?.summary) {
      summary = out.summary.trim();
      summarySource = "model";
    }
  }

  const at = now();
  return {
    ...clearAfter(state, "research"),
    research: {
      name: ctx.brand.name,
      domain,
      summary,
      summarySource,
      keywords,
      category,
      categoryPhrases: reading.phrases.length ? reading.phrases : category ? [category] : [],
      categoryAreas: page ? categoryAreas(page, keywords) : [],
      audiencePhrases: audiences.map((a) => a.phrase),
      // The link list is only needed while mining articles; not stored.
      page: page ? { ...page, links: [] } : null,
      pageError,
      evidence: page ? [{ kind: "page", url: page.finalUrl, at: page.fetchedAt }] : [{ kind: "profile", quote: "Brand profile", at }],
      ranAt: at,
    },
  };
}

// The research's category phrases and the terms that match them.
export function researchTerms(research: Pick<Research, "categoryPhrases" | "categoryAreas">, fallbackCategory: string): { phrases: string[]; primary: string[]; related: string[] } {
  const phrases = research.categoryPhrases?.length ? research.categoryPhrases : fallbackCategory.trim() ? [fallbackCategory.trim()] : [];
  return { phrases, ...categoryTerms(phrases, research.categoryAreas ?? []) };
}

// ---- Step 2: competitors ---------------------------------------------------
// Two kinds of query. "<Brand> alternatives" finds the comparison articles
// buyers read, the best public evidence of who competes; its results only
// count when they are about this company (they mention its domain or its
// category), because a name like "Threadly" is shared with unrelated
// products. Category queries ("best CRM software") cover brands too new to
// have comparison articles.
export interface CompetitorQuery {
  q: string;
  // Results must be shown to be about this company before they count.
  brand: boolean;
}

export function competitorQueries(name: string, domain: string, phrases: string[], keywords: string[], tracked: string[], areas: string[] = []): CompetitorQuery[] {
  const qs: CompetitorQuery[] = [];
  const brand = name.trim();
  if (brand) qs.push({ q: `${brand} alternatives`, brand: true }, { q: `${brand} competitors`, brand: true }, { q: `${brand} vs`, brand: true });
  // A suite described only broadly ("cloud software suite") is searched by
  // the product kinds it lists ("best CRM software").
  const broad = categoryTerms(phrases).primary.length === 0;
  const kind = broad ? areas.find((a) => /^(crm|erp|hris|ats|help ?desk|accounting|payroll|invoicing|project management|email marketing|analytics)$/.test(a)) : undefined;
  if (kind) qs.push({ q: `best ${kind.length <= 4 ? kind.toUpperCase() : kind} software`, brand: false });
  const topics = searchTopics(phrases);
  const fallback = topics.length ? topics : keywords.filter((k) => k.includes(" ")).slice(0, 1);
  for (const p of fallback.slice(0, kind ? 1 : 2)) {
    const generic = /\b(platform|software|solution|tool|app|suite|system|service)s?$/i.test(p);
    qs.push({ q: generic ? `best ${p.replace(/s$/, "")}s` : `best ${p} software`, brand: false });
  }
  if (tracked[0]) qs.push({ q: `${tracked[0]} alternatives`, brand: false });
  if (!brand) qs.push({ q: `${domain} alternatives`, brand: true });
  const seen = new Set<string>();
  return qs.filter((x) => {
    const k = x.q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 6);
}

// A brand-query result is about this company when it names the company and
// shows its category or domain: "Notion alternatives" articles talk about
// workspaces; pages about another product called Threadly do not.
export function aboutCompany(hit: Pick<SearchHit, "title" | "content" | "url">, name: string, domain: string, terms: string[]): boolean {
  const text = `${hit.title} ${hit.content} ${hit.url}`.toLowerCase();
  const named = new RegExp(`(^|[^a-z0-9])${name.toLowerCase().replace(/[^a-z0-9]+/g, "[^a-z0-9]?")}([^a-z0-9]|$)`).test(text) || text.includes(domain);
  return named && (text.includes(domain) || !terms.length || termsIn(text, terms).length > 0);
}

// Topic terms a competitor's own homepage must mention to be kept, used when
// the site names no category phrase.
const TOPIC_FILLER = new Set(["the", "and", "for", "with", "your", "our", "you", "that", "from", "into", "built", "purpose", "system", "platform", "software", "tool", "tools", "around", "grow", "growth", "build", "building"]);

export function topicTerms(keywords: string[], category: string): string[] {
  const words = new Set<string>();
  for (const k of [...keywords, category]) {
    for (const w of k.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
      if (w.length >= 3 && !TOPIC_FILLER.has(w)) words.add(w);
    }
  }
  const phrases = [...keywords, category].map((k) => k.toLowerCase().trim()).filter((k) => k.includes(" "));
  return [...new Set([...phrases, ...words])];
}

const DOMAIN_MENTION = /\b([a-z0-9][a-z0-9-]{1,40}\.(?:ai|io|com|co|app|dev|so|tech|net|org|xyz|cloud|tools))\b/gi;

export function rankCompetitorCandidates(
  hits: Array<SearchHit & { query: string }>,
  own: string,
  tracked: string[],
  at: string,
  articleLinks: Array<{ url: string; domains: string[] }> = [],
  // Pages from "<brand> alternatives" searches that were checked to be
  // about this company.
  brandUrls: Set<string> = new Set(),
): Competitor[] {
  const byDomain = new Map<string, Competitor & { score: number; urls: Set<string> }>();
  const ownLabel = own.split(".")[0];
  const touch = (domain: string, weight: number, ev: Evidence) => {
    const d = rootDomain(domain);
    // Its own other domains (notion.so for notion.com) are the same company.
    if (!d || d === own || d.endsWith(`.${own}`) || d.split(".")[0] === ownLabel || isNonCompany(d)) return;
    const c = byDomain.get(d) ?? { domain: d, name: d, description: null, tracked: tracked.includes(d), selected: true, appearances: 0, evidence: [], score: 0, urls: new Set<string>() };
    c.score += weight;
    c.appearances += 1;
    if (ev.url) c.urls.add(ev.url);
    if (c.evidence.length < 4) c.evidence.push(ev);
    byDomain.set(d, c);
  };
  for (const hit of hits) {
    touch(hit.domain, isHomepage(hit.url) ? 3 : 1, { kind: "search", query: hit.query, url: hit.url, at });
    for (const m of `${hit.title} ${hit.content}`.matchAll(DOMAIN_MENTION)) {
      touch(m[1], 1, { kind: "search", query: hit.query, url: hit.url, quote: `mentioned as ${m[1].toLowerCase()}`, at });
    }
  }
  // A company site linked from a "best tools" article is a strong signal;
  // several independent articles linking it is stronger still.
  for (const article of articleLinks) {
    for (const d of article.domains) touch(d, 2, { kind: "page", url: article.url, quote: "linked from this article", at });
  }
  // One brand on several TLDs (creatio.ai, creatio.com) is one competitor.
  const byLabel = new Map<string, Competitor & { score: number; urls: Set<string> }>();
  for (const c of byDomain.values()) {
    const label = c.domain.split(".")[0];
    const prev = byLabel.get(label);
    if (!prev) byLabel.set(label, c);
    else if (c.score > prev.score) byLabel.set(label, { ...c, score: c.score + prev.score, appearances: c.appearances + prev.appearances, urls: new Set([...c.urls, ...prev.urls]) });
    else {
      prev.score += c.score;
      for (const u of c.urls) prev.urls.add(u);
    }
  }
  return [...byLabel.values()]
    .filter((c) => c.tracked || c.score >= 2)
    .sort((a, b) => Number(b.tracked) - Number(a.tracked) || b.score - a.score || a.domain.localeCompare(b.domain))
    .map(({ score: _score, urls, ...c }) => ({ ...c, sources: urls.size, consensus: [...urls].filter((u) => brandUrls.has(u)).length }));
}

// Capitalised names that several comparison results mention: "Top Zoho
// alternatives: HubSpot, Salesforce, Odoo, Freshsales...". Review sites'
// snippets count here even though their pages cannot be read. Returns each
// name with the number of distinct results naming it, most first.
const NOT_A_NAME = new Set(("The This That These Those Best Top Free Pricing Price Plans Plan Features Feature Pros Cons Rating Ratings Reviews Review Alternatives Alternative Competitors Competitor Compare Comparison Software Tools Tool Platform Platforms App Apps CRM ERP AI API SaaS SMB B2B B2C Small Business Businesses Enterprise Teams Team Sales Marketing Support Finance Customer Customers Service Services Our We You Your It Its In For How What Why Who When Which Is Are Can And Or With Without Get See Learn Read More Start Try Sign Log Book Demo Overview Summary Conclusion Introduction Table Contents Updated Published January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday Google Microsoft Apple Amazon Facebook LinkedIn Twitter Reddit YouTube Gmail Outlook Excel Windows Mac Android iOS Chrome ChatGPT Gemini Claude Perplexity Copilot Grok Llama OpenAI Anthropic Open While Email Legal Cloud Insights Data Teams Agents Agent Search Workspace Visibility Prospecting USA US UK India Europe One Two Three Four Five Six Seven Eight Nine Ten FAQ FAQs Key Main Final Bottom Line Verdict Option Options Choice Choices Vs Versus").split(" "));

export function namesInResults(results: Array<Pick<SearchHit, "title" | "content">>, ownName: string, exclude: string[] = [], min = 3): Array<{ name: string; count: number }> {
  const own = ownName.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Words the company uses for its own category are not other companies.
  const ownWords = new Set(exclude.flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length >= 3));
  const counts = new Map<string, number>();
  for (const r of results) {
    const seen = new Set<string>();
    // Body text only: headlines capitalise every word.
    const text = r.content;
    for (const m of text.matchAll(/(^|[^A-Za-z0-9.])([A-Z][a-z]*[A-Z0-9]?[a-zA-Z0-9]*(?:\.(?:com|io|ai|co|net))?)\b/g)) {
      const name = m[2];
      const at = (m.index ?? 0) + m[1].length;
      // The first word of a sentence is capitalised whatever it is.
      if (at === 0 || /[.!?:;•\n]\s*$/.test(text.slice(Math.max(0, at - 3), at))) continue;
      const key = name.toLowerCase().replace(/\.(com|io|ai|co|net)$/, "").replace(/[^a-z0-9]/g, "");
      if (key.length < 3 || NOT_A_NAME.has(name) || key === own || key.startsWith(own) || ownWords.has(key) || /^\d/.test(name)) continue;
      seen.add(name);
    }
    for (const n of seen) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// Everyday tools named in every comparison as integrations ("works with
// Slack"); they count as competitors only when their homepage sells the
// same category, never on mentions alone.
const INTEGRATION_HOSTS = /^(slack\.com|zapier\.com|chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|perplexity\.ai|gmail\.com|outlook\.com|zoom\.us|dropbox\.com|github\.com|gitlab\.com|figma\.com|canva\.com|wordpress\.org|shopify\.com|notion\.so|trello\.com|calendly\.com|quickbooks\.com|mailchimp\.com)$/;

// Whether a candidate's own homepage shows it sells in the same category.
// Its own category words count most; synonyms count when independent
// sources also list it. Returns the matched terms, or null when it is not a
// competitor.
export function competitorMatch(text: string, sources: number, primary: string[], related: string[], consensus = 0, integration = false): string[] | null {
  const own = termsIn(text, primary);
  const near = termsIn(text, related);
  const keep = (own.length >= 1 && (sources >= 2 || near.length >= 1 || own.some((t) => t.includes(" "))))
    || (near.length >= 2 && sources >= 2)
    || (near.length >= 1 && sources >= 3)
    // Three or more independent comparisons of this company agree, and the
    // homepage is a product's: that is a competitor even when it describes
    // itself in other words (a suite like Zoho is compared with Odoo).
    || (consensus >= 3 && PRODUCT_PAGE.test(text))
    || (consensus >= 2 && near.length >= 1);
  // Mentions alone never make an everyday integration a competitor.
  if (keep && integration && !own.length && near.length < 2) return null;
  return keep ? [...own, ...near, ...(own.length + near.length ? [] : [`named in ${consensus} comparisons`])] : null;
}

const PRODUCT_PAGE = /\b(software|platform|app|apps|tool|tools|crm|erp|suite|saas|cloud|automat\w*|manage\w*|api|dashboard|workflow|customers?)\b/i;

export async function runCompetitors(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const research = state.research;
  if (!research) throw new StepBlocked("Research your company first.");
  const at = now();
  const tracked = (ctx.brand.competitors ?? []).map((c) => rootDomain(c.domain || "")).filter(Boolean);
  if (tracked.length) ctx.log(`starting from ${tracked.length} competitors tracked in your brand profile`);

  const { phrases, primary, related } = researchTerms(research, ctx.brand.category);
  const allTerms = [...primary, ...related];
  const queries = competitorQueries(research.name, research.domain, phrases, research.keywords, tracked, research.categoryAreas ?? []);
  const hits: Array<SearchHit & { query: string }> = [];
  const brandUrls = new Set<string>();
  if (searchAvailable()) {
    const batches = await mapLimit(queries, 3, async ({ q, brand }) => {
      ctx.log(`searching the web: "${q}"`);
      try {
        const results = await search(q, 10);
        // Brand results must be about this company, not a namesake.
        const kept = brand ? results.filter((r) => aboutCompany(r, research.name, research.domain, allTerms)) : results;
        if (brand) for (const r of kept) brandUrls.add(r.url);
        ctx.log(`  "${q}": ${results.length} results${brand && kept.length < results.length ? `, ${results.length - kept.length} about a different product with the same name` : ""}`);
        return kept.map((r) => ({ ...r, query: q }));
      } catch {
        ctx.log(`  "${q}": search failed; continuing`);
        return [];
      }
    });
    hits.push(...batches.flat());
  } else {
    ctx.log("web search is not configured on this deployment; using tracked competitors only");
  }

  // Read the comparison articles and collect the company sites they link to.
  const articles = hits
    .filter((h) => !isHomepage(h.url) && !UNREADABLE_ARTICLES.test(rootDomain(h.domain)) && !isProfileSite(rootDomain(h.domain)) && rootDomain(h.domain) !== research.domain)
    .filter((h, i, all) => all.findIndex((x) => x.url === h.url) === i)
    .sort((a, b) => Number(brandUrls.has(b.url)) - Number(brandUrls.has(a.url)) || Number(LIST_TITLE.test(b.title) || /alternative|competitor|\bvs\b/i.test(b.title)) - Number(LIST_TITLE.test(a.title) || /alternative|competitor|\bvs\b/i.test(a.title)))
    .slice(0, 12);
  if (articles.length) ctx.log(`reading ${articles.length} comparison articles for the companies they link to`);
  const articleLinks = (
    await mapLimit(articles, 6, async (a) => {
      if (pastDeadline(ctx)) return { url: a.url, domains: [] as string[] };
      try {
        const page = await fetchPage(a.url, 8000);
        const domains = outboundDomains(page.links, page.domain).map(rootDomain).filter((d) => !isNonCompany(d));
        ctx.log(`  ${a.domain}: ${domains.length} linked sites`);
        if (brandUrls.has(a.url)) brandUrls.add(page.finalUrl);
        return { url: page.finalUrl, domains: [...new Set(domains)] };
      } catch (error) {
        ctx.log(`  ${a.domain}: article ${describeError(error)}`);
        return { url: a.url, domains: [] as string[] };
      }
    })
  ).filter((a) => a.domains.length);

  let items = rankCompetitorCandidates(hits, research.domain, tracked, at, articleLinks, brandUrls);
  // Names several comparison results agree on. A candidate already found by
  // its links gets the agreement as consensus; a name not yet linked is
  // tried at its .com, and kept only if that homepage carries the name.
  const agreed = namesInResults(hits.filter((h) => brandUrls.has(h.url) || /alternative|competitor|\bvs\b|best|top/i.test(h.title)), research.name, [...phrases, ...primary, ...related, ...(research.categoryAreas ?? [])]);
  const labelOf = (d: string) => d.split(".")[0].replace(/[^a-z0-9]/g, "");
  const guessed = new Map<string, string>();
  for (const { name, count } of agreed.slice(0, 20)) {
    const key = name.toLowerCase().replace(/\.(com|io|ai|co|net)$/, "").replace(/[^a-z0-9]/g, "");
    const existing = items.find((c) => labelOf(c.domain) === key);
    if (existing) {
      existing.consensus = Math.max(existing.consensus ?? 0, count);
      existing.sources = Math.max(existing.sources ?? 0, count);
      continue;
    }
    const domain = /\.(com|io|ai|co|net)$/i.test(name) ? name.toLowerCase() : `${key}.com`;
    if (domain === research.domain || isNonCompany(domain) || isProfileSite(domain)) continue;
    guessed.set(domain, name);
    items.push({ domain, name, description: null, tracked: false, selected: true, appearances: count, sources: count, consensus: count, evidence: [{ kind: "search", query: "comparisons", quote: `named in ${count} comparison results`, at }] });
  }
  if (agreed.length) ctx.log(`names most comparison results agree on: ${agreed.slice(0, 8).map((a) => `${a.name} (${a.count})`).join(", ")}`);
  items.sort((a, b) => Number(b.tracked) - Number(a.tracked) || (b.consensus ?? 0) - (a.consensus ?? 0) || (b.sources ?? 0) - (a.sources ?? 0));
  for (const d of tracked) {
    if (!items.some((c) => c.domain === d)) {
      const comp = ctx.brand.competitors.find((c) => rootDomain(c.domain) === d);
      items.unshift({ domain: d, name: comp?.name ?? d, description: null, tracked: true, selected: true, appearances: 0, sources: 0, evidence: [{ kind: "profile", quote: "Tracked in your brand profile", at }] });
    }
  }
  items = items.slice(0, MAX_COMPETITORS + 20);
  ctx.log(`ranked ${items.length} candidate domains; reading their homepages to check each one sells ${phrases[0] ? `a ${phrases[0]}` : "in your category"}`);

  const fallbackTerms = topicTerms(research.keywords, ctx.brand.category);
  const offTopic: string[] = [];
  const unreachable: string[] = [];
  const audienceTally = new Map<string, { phrase: string; count: number; quote: string; url: string }>();
  const checked = await mapLimit(items, 6, async (c): Promise<(Competitor & { matched: number }) | null> => {
    if (pastDeadline(ctx) && !c.tracked) return null;
    try {
      const page = await fetchPage(c.domain, 6000);
      const description = page.description ?? firstSentence(page.paragraphs[0]);
      const text = [page.title, description, ...page.headings.slice(0, 12), ...page.paragraphs.slice(0, 4)].filter(Boolean).join(" ");
      let matched: string[] | null = null;
      // A guessed domain must carry the name the comparisons used.
      const guess = guessed.get(c.domain);
      if (guess) {
        const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const named = squash(companyName(page, page.domain)).includes(squash(guess).replace(/(com|io|ai|co|net)$/, "")) || squash(page.title ?? "").includes(squash(guess).replace(/(com|io|ai|co|net)$/, ""));
        if (!named) {
          offTopic.push(c.domain);
          return null;
        }
      }
      const integration = INTEGRATION_HOSTS.test(rootDomain(page.domain));
      if (allTerms.length || (c.consensus ?? 0) >= 2) matched = competitorMatch(text, c.sources ?? c.appearances, primary, related, guess ? 0 : c.consensus ?? 0, integration);
      if (!matched && !allTerms.length) {
        // No category phrase on the site: the old keyword rule.
        const hitsOn = onTopic([page.title, description, ...page.headings].filter(Boolean).join(" "), fallbackTerms);
        const loose = matchedTerms([page.title, description, ...page.headings].filter(Boolean).join(" "), fallbackTerms);
        matched = hitsOn.length ? hitsOn : loose.length && c.appearances >= 2 ? loose : null;
      }
      if (!c.tracked && (!matched || INTERSTITIAL.test(page.title ?? ""))) {
        offTopic.push(c.domain);
        return null;
      }
      for (const a of extractAudiencePhrases(page, 4)) {
        const key = a.phrase.toLowerCase();
        const prev = audienceTally.get(key);
        audienceTally.set(key, prev ? { ...prev, count: prev.count + 1 } : { phrase: a.phrase, count: 1, quote: a.quote, url: page.finalUrl });
      }
      return {
        ...c,
        domain: guess ? rootDomain(page.domain) : c.domain,
        name: c.tracked ? c.name : companyName(page, c.domain),
        description,
        matched: matched?.length ?? 0,
        evidence: [...c.evidence, { kind: "page" as const, url: page.finalUrl, quote: matched?.length ? `its homepage mentions ${matched.slice(0, 3).join(", ")}` : undefined, at: page.fetchedAt }],
      };
    } catch (error) {
      if (c.tracked) ctx.log(`  ${c.domain}: homepage ${describeError(error)}; kept because you track it`);
      // Some sites refuse automated readers (freshworks.com answers 403);
      // three independent comparisons naming it are evidence enough.
      else if ((c.consensus ?? 0) >= 3 && !INTEGRATION_HOSTS.test(c.domain) && (!guessed.has(c.domain) || ((c.consensus ?? 0) >= 5 && /[a-z][A-Z]|\d/.test(guessed.get(c.domain) ?? "")))) {
        ctx.log(`  ${c.domain}: homepage ${describeError(error)}; kept because ${c.consensus} comparisons name it`);
        const label = c.domain.split(".")[0];
        return { ...c, name: label.charAt(0).toUpperCase() + label.slice(1), matched: 0 };
      } else unreachable.push(c.domain);
      return c.tracked ? { ...c, matched: 0 } : null;
    }
  });
  const sample = (list: string[]) => `${list.slice(0, 4).join(", ")}${list.length > 4 ? ` and ${list.length - 4} more` : ""}`;
  if (offTopic.length) ctx.log(`  dropped ${offTopic.length} whose homepage sells something else: ${sample(offTopic)}`);
  if (unreachable.length) ctx.log(`  dropped ${unreachable.length} whose homepage could not be read: ${sample(unreachable)}`);
  const read = checked
    .filter((c): c is Competitor & { matched: number } => c !== null)
    .sort((a, b) => Number(b.tracked) - Number(a.tracked) || (b.consensus ?? 0) - (a.consensus ?? 0) || (b.sources ?? 0) - (a.sources ?? 0) || b.matched - a.matched)
    .slice(0, MAX_COMPETITORS)
    .map(({ matched: _m, ...c }) => c);
  ctx.log(`kept ${read.length} competitors named by independent sources`);

  return {
    ...clearAfter(state, "competitors"),
    competitors: {
      items: read,
      audiences: [...audienceTally.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      queries: searchAvailable() ? queries.map((q) => q.q) : [],
      searchAvailable: searchAvailable(),
      ranAt: at,
    },
  };
}

// ---- Step 3: campaigns -----------------------------------------------------
const DEFAULT_ROLES = ["Founder", "CEO", "Head of Marketing", "Head of Growth"];

// Who buys this category: the roles a first email should go to.
const ROLE_RULES: Array<[RegExp, string[]]> = [
  [/\b(crm|sales|prospecting|outbound|outreach|cold email|lead gen|lead generation|pipeline|sales intelligence|sales engagement|revenue)\b/, ["Head of Sales", "VP Sales", "Head of Growth", "Founder"]],
  [/\b(ai visibility|seo|marketing|advertising|content|social media|geo|brand)\b/, ["Head of Marketing", "CMO", "Head of Growth", "Head of SEO"]],
  [/\b(payments?|billing|invoicing|accounting|finance|financial|payroll|checkout)\b/, ["CFO", "Head of Finance", "Head of Payments", "Founder"]],
  [/\b(workspace|wiki|knowledge base|docs|project management|work management|notes)\b/, ["COO", "Head of Operations", "Head of Product", "Founder"]],
  [/\b(helpdesk|help desk|customer support|ticketing|customer service)\b/, ["Head of Support", "VP Customer Success", "COO"]],
  [/\b(hr|hris|recruiting|hiring|applicant tracking|people ops)\b/, ["Head of People", "Head of Talent", "COO"]],
  [/\b(security|compliance|soc 2)\b/, ["CISO", "Head of Security", "CTO"]],
  [/\b(observability|monitoring|infrastructure|api|developer|devops|database|hosting)\b/, ["CTO", "VP Engineering", "Head of Platform"]],
  [/\b(analytics|data|dashboards)\b/, ["Head of Data", "Head of Product", "CTO"]],
];

export function rolesFor(terms: string[]): string[] {
  const text = ` ${terms.join(" ").toLowerCase()} `;
  return ROLE_RULES.find(([re]) => re.test(text))?.[1] ?? DEFAULT_ROLES;
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function campaignsFromAudiences(audiences: Array<{ phrase: string; quote: string }>, url: string | undefined, at: string, roles: string[] = DEFAULT_ROLES): Campaign[] {
  return audiences.map((a) => ({
    id: `cmp_${randomUUID().slice(0, 8)}`,
    name: titleCase(a.phrase),
    description: `Your site names this audience: "${a.quote.length > 160 ? `${a.quote.slice(0, 157)}...` : a.quote}"`,
    searchQuery: `${a.phrase} companies`,
    roles,
    source: "homepage" as const,
    evidence: [{ kind: "page" as const, url, quote: a.quote, at }],
    selected: true,
  }));
}

export async function runCampaigns(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const research = state.research;
  if (!research || !state.competitors) throw new StepBlocked("Explore competitors first.");
  const at = now();
  const page = research.page;
  const audiences = page ? extractAudiencePhrases(page) : [];
  const { phrases, related: relatedTerms } = researchTerms(research, ctx.brand.category);
  const roles = rolesFor([...phrases, ...relatedTerms]);
  ctx.log(`found ${audiences.length} audience statements on your homepage`);
  let items = campaignsFromAudiences(audiences, page?.finalUrl, at, roles);

  if (modelEnabled() && page) {
    ctx.log("drafting additional campaigns with the model from your homepage text");
    const out = await modelJson<{ campaigns?: Array<{ name?: string; description?: string; searchQuery?: string; roles?: string[] }> }>(
      'Propose up to 4 distinct B2B customer segments this company could prospect. Use only the evidence. Shape: {"campaigns":[{"name":string,"description":string,"searchQuery":string (a web search that finds such companies),"roles":string[] (job titles to contact)}]}',
      { homepage: [page.title, page.description, ...page.headings, ...page.paragraphs].filter(Boolean).join("\n"), summary: research.summary },
    );
    for (const c of out?.campaigns ?? []) {
      if (!c.name || !c.searchQuery) continue;
      items.push({
        id: `cmp_${randomUUID().slice(0, 8)}`,
        name: c.name.slice(0, 80),
        description: (c.description ?? "").slice(0, 300),
        searchQuery: c.searchQuery.slice(0, 160),
        roles: (c.roles ?? DEFAULT_ROLES).slice(0, 6).map((r) => String(r).slice(0, 60)),
        source: "model",
        evidence: [{ kind: "page", url: page.finalUrl, quote: "Drafted by the model from your homepage text; review before use", at }],
        selected: true,
      });
    }
  }
  // Companies that already pay a competitor are proven buyers of the
  // category; they come from the competitors' own public customer stories.
  const rivals = state.competitors.items.slice(0, 2);
  if (rivals.length) {
    items.push({
      id: `cmp_${randomUUID().slice(0, 8)}`,
      name: `Teams already using ${rivals.map((r) => r.name).join(" or ")}`,
      description: `Companies that already pay for ${phrases[0] ? `a ${phrases[0]}` : "this category"}, from ${rivals[0].name}'s public customer stories.`,
      searchQuery: `${rivals[0].name} customer stories`,
      roles,
      source: "competitors",
      evidence: rivals.map((r) => ({ kind: "page" as const, url: `https://${r.domain}/`, quote: `${r.name} sells in the same category`, at })),
      selected: true,
    });
  }
  // No audience named on the site and no competitor to start from: use the
  // audience several competitors name on their own homepages, with the quote.
  const theirs = state.competitors.audiences?.[0];
  if (!items.length && theirs && theirs.count >= 2) {
    items.push({
      id: `cmp_${randomUUID().slice(0, 8)}`,
      name: titleCase(theirs.phrase),
      description: `Named by ${theirs.count} competitor homepage${theirs.count === 1 ? "" : "s"}: "${theirs.quote.length > 140 ? `${theirs.quote.slice(0, 137)}...` : theirs.quote}"`,
      searchQuery: /compan|startup|firm|agenc|business|brand/i.test(theirs.phrase) ? theirs.phrase : `${theirs.phrase} companies`,
      roles,
      source: "homepage",
      evidence: [{ kind: "page", url: theirs.url, quote: theirs.quote, at }],
      selected: true,
    });
    ctx.log(`your homepage names no audience; using "${theirs.phrase}", which your competitors name`);
  }
  // Still nothing: propose one campaign from the site's own top keyword
  // phrase, labelled as such, so the run can continue.
  const phrase = phrases[0] || research.keywords.find((k) => k.includes(" ")) || research.keywords[0];
  if (!items.length && phrase) {
    items.push({
      id: `cmp_${randomUUID().slice(0, 8)}`,
      name: titleCase(`Companies that need ${phrase}`),
      description: `Suggested from "${phrase}" on your homepage. Edit it to describe who you sell to.`,
      searchQuery: `companies investing in ${phrase}`,
      roles,
      source: "homepage",
      evidence: [{ kind: "page", url: page?.finalUrl, quote: `keyword: ${phrase}`, at }],
      selected: true,
    });
    ctx.log(`no audience named on the homepage; suggested one campaign from "${phrase}"`);
  }
  items = items.slice(0, 6);
  if (!items.length) ctx.log("no audience statements found; add a campaign describing who you sell to");
  else ctx.log(`prepared ${items.length} campaign${items.length === 1 ? "" : "s"}; edit, remove or add your own before continuing`);
  return { ...clearAfter(state, "campaigns"), campaigns: { items, ranAt: at } };
}

// ---- Step 4: companies -----------------------------------------------------
const QUERY_FILLER = new Set(["companies", "company", "startups", "startup", "top", "best", "with", "that", "for", "and", "the", "teams"]);

export function campaignVocabulary(c: Pick<Campaign, "name" | "searchQuery" | "description">): string[] {
  const words = `${c.name} ${c.searchQuery}`.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/);
  return [...new Set(words.filter((w) => w.length >= 3 && !QUERY_FILLER.has(w)))];
}

// Review sites refuse automated readers and social platforms link to
// everything, so their pages are not read for the companies they name.
const UNREADABLE_ARTICLES = /^(g2\.com|capterra\.com|getapp\.com|softwareadvice\.com|trustradius\.com|gartner\.com|sourceforge\.net|reddit\.com|linkedin\.com|x\.com|twitter\.com|facebook\.com|youtube\.com|quora\.com|medium\.com|instagram\.com|tiktok\.com)$/;

// Homepages that describe a publisher, newsroom, journal, community,
// directory or investor: they rank for every query but do not buy software.
const NOT_A_PROSPECT = /\b(news(room| site| network| outlet)?|magazine|journal|newspaper|publisher|scholarly publishing|broadcast(er|ing)|podcast network|media (company|group|network|brand)|entertainment company|forum|directory|every vendor compared|venture capital|we invest in|vc firm|venture firm|portfolio companies|wiki(pedia)?)\b/i;

// The company's own team or leadership page, linked from its homepage.
const PEOPLE_PATH = /\/(leadership|our-team|team|management|people|founders|about-us|about|company|who-we-are)(\/|$)/i;

export function peoplePage(links: string[], domain: string): string | undefined {
  const root = rootDomain(domain);
  const own = links.filter((l) => {
    try {
      const u = new URL(l);
      return rootDomain(u.hostname) === root && PEOPLE_PATH.test(u.pathname);
    } catch {
      return false;
    }
  });
  const rank = (l: string) => {
    const path = new URL(l).pathname.toLowerCase();
    return /leadership|team|management|founders|people/.test(path) ? 0 : 1;
  };
  return own.sort((a, b) => rank(a) - rank(b) || a.length - b.length)[0];
}

// A customer named on a competitor's customer-story page: from the title
// ("How Intercom PMMs save one day a month working in Coda") or from the URL
// slug (/solutions/case-studies/qualtrics, /magazine/ashby-customer-story).
const STORY_SLUG = /\/(?:case-stud(?:y|ies)|customers?|customer-stor(?:y|ies)|success-stor(?:y|ies))\/([a-z0-9][a-z0-9-]{1,60})\/?$|\/([a-z0-9][a-z0-9-]{1,60}?)-(?:customer-story|case-study|success-story)\/?$/i;
const STORY_HOW = /^how\s+(.{2,40}?)\s+(?:uses?|used|scaled|scales|built|builds|cut|cuts|saved?|saves|grew|grows|got|gets|increased|reduced|transformed|streamlined|achieved|drives?|runs?|manages?|leverages?|boosted|doubled|tripled|turned|moved|switched|centrali[sz]ed|keeps?|went|made|brought|replaced|unified|accelerated|improved|automated|empowers?|powers?|supports?|gained|generated|closed|booked|won)\b/i;
const STORY_LABEL = /^(.{2,40}?)\s*(?:[|:\-–—]\s*)?(?:case study|customer story|success story)\b/i;
// Words that mean the page is a listing or a topic, not one customer.
const NOT_A_CUSTOMER = new Set(["to", "i", "my", "how", "why", "what", "free", "new", "get", "use", "using", "our", "customers", "customer", "stories", "story", "case", "studies", "study", "all", "index", "page", "enterprise", "startups", "startup", "smb", "industry", "industries", "teams", "team", "companies", "company", "the", "this", "you", "your", "we", "a", "an", "top", "best", "leading", "global", "agencies", "healthcare", "finance", "retail", "saas", "b2b", "sales", "marketing", "support", "success", "results", "examples", "testimonials", "reviews"]);

function storyName(raw: string, rival: string): string | null {
  const name = raw
    .replace(new RegExp(`\\b${rival.replace(/[^a-z0-9]+/gi, ".?")}\\b('s)?`, "gi"), " ")
    .replace(/[’']s\b/g, "")
    .replace(/\b(team|teams|pmms?|reps?|sdrs?|marketers|engineers|developers|ops)\b.*$/i, "")
    .replace(/[^\p{L}\p{N}&.+ -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = name.split(" ").filter(Boolean);
  if (!words.length || words.length > 4 || name.length < 2 || words.every((w) => NOT_A_CUSTOMER.has(w.toLowerCase()))) return null;
  if (NOT_A_CUSTOMER.has(words[0].toLowerCase())) return null;
  return name;
}

export function caseStudyCustomer(hit: Pick<SearchHit, "title" | "url">, rival: string): { name: string; slug: string | null } | null {
  // Link text from a listing ("Read the story", "Learn more") is not a title.
  if (/^(read|learn|view|see|watch|download|explore|discover)\b|^(more|story|case study)$/i.test(hit.title.trim())) hit = { ...hit, title: "" };
  let path = "";
  try {
    path = new URL(hit.url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (/\/(blog|news|press|newsroom|insights|resources\/articles)\//.test(path)) return null;
  const m = path.match(STORY_SLUG);
  const slug = (m?.[1] ?? m?.[2] ?? null)?.replace(/-(?:customer-story|case-study|success-story)$/, "") ?? null;
  const usableSlug = slug && !slug.split("-").every((w) => NOT_A_CUSTOMER.has(w)) ? slug : null;
  const title = hit.title.split(/\s+[|]\s+|\s+[-–—]\s+(?=[^-–—]*$)/)[0].trim();
  const fromTitle = title.match(STORY_HOW)?.[1] ?? title.match(STORY_LABEL)?.[1] ?? null;
  const fromSlug = usableSlug ? usableSlug.split("-").slice(0, 3).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : null;
  // Only customer-story pages: a story path (/customers/intercom) or a title
  // that says it is one. "How X uses Y" on a blog is often a how-to.
  if (!usableSlug && !STORY_LABEL.test(title)) return null;
  const name = (fromTitle && storyName(fromTitle, rival)) || (fromSlug && storyName(fromSlug, rival));
  return name ? { name, slug: usableSlug } : null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");


// Links to individual customer stories on a competitor's own customers
// page (/customers, /case-studies...), with relative links resolved. Each
// comes back with its link text as a title, for the name.
export function storyLinksIn(html: string, base: string, rivalDomain: string): Array<{ title: string; url: string }> {
  const out = new Map<string, { title: string; url: string }>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]), base);
    } catch {
      continue;
    }
    if (rootDomain(url.hostname) !== rootDomain(rivalDomain) || !STORY_SLUG.test(url.pathname.replace(/\/$/, ""))) continue;
    const key = url.pathname.replace(/\/$/, "").toLowerCase();
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!out.has(key) || (text && !out.get(key)!.title)) out.set(key, { title: text, url: url.toString() });
  }
  return [...out.values()];
}

async function listedStories(rivalDomain: string): Promise<Array<{ title: string; url: string }>> {
  for (const path of ["/customers", "/case-studies", "/customer-stories", "/customers/stories", "/success-stories"]) {
    try {
      const { html, finalUrl } = await fetchHtml(`https://${rivalDomain}${path}`, 7000);
      const links = storyLinksIn(html, finalUrl, rivalDomain);
      if (links.length >= 3) return links;
    } catch {
      // no such page
    }
  }
  return [];
}

// A domain belongs to a named company when its first label is the name,
// written with or without spaces ("Built In" is builtin.com), or the name
// plus a short suffix ("Huge" is hugeinc.com).
export function domainMatchesName(domain: string, name: string): boolean {
  const label = squash(domain.split(".")[0]);
  const key = squash(name);
  if (!key || !label) return false;
  return label === key || (key.length >= 4 && label.startsWith(key) && label.length - key.length <= 4) || (label.length >= 5 && key.startsWith(label));
}

// Finds a customer's own domain: a link from the story page whose name
// matches, else the usual domains for that name, accepted only when the
// homepage there carries the same name.
async function customerDomain(name: string, slug: string | null, storyUrl: string, rivalDomain: string): Promise<string | null> {
  try {
    const page = await fetchPage(storyUrl, 7000);
    const linked = outboundDomains(page.links, page.domain).map(rootDomain).filter((d) => d !== rivalDomain && !isNonCompany(d) && !isProfileSite(d));
    const hit = linked.find((d) => domainMatchesName(d, name) || (slug !== null && domainMatchesName(d, slug)));
    if (hit) return hit;
  } catch {
    // the story page could not be read; try the usual domains
  }
  // The name's .com, accepted only when that homepage is a live company
  // carrying the same name. Other endings are too often someone else.
  const key = squash(slug ?? name);
  if (key.length < 4) return null;
  try {
    const home = await fetchPage(`${key}.com`, 5000);
    const named = squash(companyName(home, home.domain)) === squash(name) || squash(home.siteName ?? "") === squash(name) || squash((home.title ?? "").split(/[|:–—-]/)[0]) === squash(name);
    const real = Boolean(home.description) && !/coming soon|launching soon|for sale|parked|buy this domain/i.test(`${home.title} ${home.description}`);
    if (named && real && !isNonCompany(rootDomain(home.domain))) return rootDomain(home.domain);
  } catch {
    // no such site
  }
  return null;
}

export async function runCompanies(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const research = state.research;
  const campaigns = (state.campaigns?.items ?? []).filter((c) => c.selected);
  if (!research || !state.competitors) throw new StepBlocked("Explore competitors first.");
  if (!campaigns.length) throw new StepBlocked("Select or add at least one campaign.");
  if (!searchAvailable()) throw new StepBlocked("Web search is not configured on this deployment (TAVILY_API_KEY), so companies cannot be discovered.");
  const at = now();
  const exclude = new Set([research.domain, ...state.competitors.items.map((c) => c.domain)]);
  // A competitor can appear on several domains (slack.engineering, slack.com).
  const brands = new Set([...exclude].map((d) => d.split(".")[0]));
  const { primary, related } = researchTerms(research, ctx.brand.category);
  // Fit evidence for a prospect is the campaign's own vocabulary found on
  // the prospect's homepage.
  const campaignTerms = new Map(campaigns.map((c) => [c.id, campaignVocabulary(c)]));
  const queries: string[] = [];
  const candidates: Array<{ domain: string; campaignId: string; ev: Evidence; signal: string; trusted: boolean }> = [];
  const taken = (d: string) => !d || exclude.has(d) || brands.has(d.split(".")[0]) || isNonCompany(d) || isProfileSite(d) || candidates.some((c) => c.domain === d);

  for (const campaign of campaigns) {
    if (pastDeadline(ctx)) break;
    if (campaign.source === "competitors") {
      // Proven buyers: customers named in each competitor's own stories.
      // Not every competitor publishes customer stories (open-source tools
      // rarely do), so up to eight are tried, stopping once enough are found.
      const rivals = state.competitors.items.slice(0, 8);
      let named = 0;
      const found = await mapLimit(rivals, 3, async (rival) => {
        if (named >= 24 || pastDeadline(ctx)) return [];
        ctx.log(`reading ${rival.name}'s public customer stories`);
        // The competitor's own customers page lists its stories; search
        // fills in when there is no such page.
        let hits: Array<Pick<SearchHit, "title" | "url">> = await listedStories(rival.domain);
        if (hits.length < 4) {
          const q = "customer stories case studies";
          queries.push(`${q} (${rival.domain})`);
          try {
            hits = [...hits, ...(await search(q, 10, { includeDomains: [rival.domain] }))];
          } catch {
            ctx.log(`  ${rival.name}: search failed; continuing`);
          }
        }
        const stories = hits
          .map((h) => ({ h, who: caseStudyCustomer(h, rival.name) }))
          .filter((x): x is { h: Pick<SearchHit, "title" | "url">; who: { name: string; slug: string | null } } => x.who !== null)
          .filter((x, i, all) => all.findIndex((y) => squash(y.who.name) === squash(x.who.name)) === i)
          .slice(0, 12);
        const resolved = await mapLimit(stories, 4, async ({ h, who }) => {
          if (pastDeadline(ctx)) return null;
          const domain = await customerDomain(who.name, who.slug, h.url, rival.domain);
          return domain ? { domain, rival, url: h.url, name: who.name } : null;
        });
        const ok = resolved.filter((r): r is NonNullable<typeof r> => r !== null);
        named += ok.length;
        ctx.log(`  ${rival.name}: ${stories.length} customer stories, ${ok.length} companies identified`);
        return ok;
      });
      for (const f of found.flat()) {
        const d = rootDomain(f.domain);
        if (taken(d)) continue;
        candidates.push({ domain: d, campaignId: campaign.id, ev: { kind: "page", url: f.url, quote: `Featured in ${f.rival.name}'s customer stories`, at }, signal: `Customer of ${f.rival.name}`, trusted: true });
      }
      continue;
    }
    const base = campaign.searchQuery.trim();
    const qs = [base, /compan|startup|firm|agenc/i.test(base) ? `top ${base}` : `${base} companies`];
    for (const q of qs) {
      if (pastDeadline(ctx)) break;
      queries.push(q);
      ctx.log(`searching the web for ${campaign.name}: "${q}"`);
      try {
        const results = await search(q, 10);
        let added = 0;
        const add = (domain: string, ev: Evidence) => {
          const d = rootDomain(domain);
          if (taken(d)) return;
          candidates.push({ domain: d, campaignId: campaign.id, ev, signal: `Matches ${campaign.name}`, trusted: false });
          added++;
        };
        // A company homepage in the results is a candidate itself; a list or
        // article ("top B2B SaaS startups") is read for the companies it
        // links to, and is never treated as a company.
        const lists: SearchHit[] = [];
        for (const r of results) {
          if (isHomepage(r.url)) add(r.domain, { kind: "search", query: q, url: r.url, at });
          // Only pages that look like company lists are mined for links;
          // news and opinion articles link to everything.
          else if (lists.length < 3 && !exclude.has(rootDomain(r.domain)) && LIST_TITLE.test(r.title)) lists.push(r);
        }
        const linked = await mapLimit(lists, 3, async (list) => {
          try {
            const page = await fetchPage(list.url, 8000);
            return { url: page.finalUrl, domains: outboundDomains(page.links, page.domain).slice(0, 40) };
          } catch {
            return { url: list.url, domains: [] as string[] };
          }
        });
        for (const l of linked) for (const d of l.domains) add(d, { kind: "page", url: l.url, quote: "linked from this list", at });
        ctx.log(`  ${results.length} results, read ${lists.length} list page${lists.length === 1 ? "" : "s"}, ${added} new company domains`);
      } catch {
        ctx.log("  search failed for this query; continuing");
      }
    }
  }

  const perCampaign = new Map<string, number>();
  const limited = candidates.filter((c) => {
    const n = perCampaign.get(c.campaignId) ?? 0;
    if (n >= MAX_COMPANIES_PER_CAMPAIGN) return false;
    perCampaign.set(c.campaignId, n + 1);
    return true;
  });
  ctx.log(`reading ${limited.length} company homepages (robots.txt respected)`);

  const skipped: Array<{ domain: string; reason: string }> = [];
  const read = await mapLimit(limited, 6, async (c): Promise<ProspectCompany | null> => {
    if (pastDeadline(ctx)) {
      skipped.push({ domain: c.domain, reason: "not read in time" });
      return null;
    }
    try {
      const page = await fetchPage(c.domain, 6000);
      if (INTERSTITIAL.test(page.title ?? "") || isNonCompany(rootDomain(page.domain))) {
        skipped.push({ domain: c.domain, reason: "not a company homepage" });
        return null;
      }
      const description = page.description ?? firstSentence(page.paragraphs[0]);
      const text = [page.title, description, ...page.headings].filter(Boolean).join(" ");
      const terms = matchedTerms(text, campaignTerms.get(c.campaignId) ?? []).slice(0, 5);
      if (NOT_A_PROSPECT.test(`${page.title ?? ""} ${description ?? ""}`)) {
        skipped.push({ domain: c.domain, reason: "a publisher, community or investor" });
        return null;
      }
      if (c.trusted && termsIn(text, primary).length && termsIn(text, related).length) {
        skipped.push({ domain: c.domain, reason: "sells in your category" });
        return null;
      }
      if (!c.trusted) {
        // A search result must show the campaign's audience on its own
        // homepage, and must not sell the same thing (that is a competitor).
        if (!terms.length) {
          skipped.push({ domain: c.domain, reason: "homepage does not match the campaign" });
          return null;
        }
        if (termsIn(text, primary).length && termsIn(text, related).length) {
          skipped.push({ domain: c.domain, reason: "sells in your category" });
          return null;
        }
      }
      return {
        domain: c.domain,
        name: companyName(page, c.domain),
        description,
        peopleUrl: peoplePage(page.links, page.domain),
        campaignId: c.campaignId,
        matchedTerms: terms,
        signal: c.signal,
        selected: true,
        evidence: [c.ev, { kind: "page", url: page.finalUrl, at: page.fetchedAt }],
      };
    } catch (error) {
      skipped.push({ domain: c.domain, reason: describeError(error) });
      return null;
    }
  });
  // Proven buyers (named in a competitor's customer stories) first.
  const trusted = new Set(limited.filter((c) => c.trusted).map((c) => c.domain));
  const items = read.filter((c): c is ProspectCompany => c !== null).sort((a, b) => Number(trusted.has(b.domain)) - Number(trusted.has(a.domain)));
  const why = [...new Set(skipped.map((s) => s.reason))].slice(0, 3).join(", ");
  ctx.log(`kept ${items.length} companies; ${skipped.length} skipped${why ? ` (${why})` : ""}`);
  return { ...clearAfter(state, "companies"), companies: { items, queries, skipped, ranAt: at } };
}

// ---- Step 5: decision makers -------------------------------------------------
export async function runContacts(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const companies = (state.companies?.items ?? []).filter((c) => c.selected);
  if (!state.companies) throw new StepBlocked("Find potential customers first.");
  if (!companies.length) throw new StepBlocked("Select at least one company.");
  const at = now();
  const provider = contactProvider();
  const roles = [...new Set((state.campaigns?.items ?? []).filter((c) => c.selected).flatMap((c) => c.roles))];
  if (!provider) {
    // Without a licensed provider, the people each company names on its own
    // team or leadership page, with that page as the source. No email is
    // guessed and no profile is scraped.
    ctx.log("no licensed contact provider is connected; reading each company's own team page for the people it names");
    const teams = await mapLimit(companies.slice(0, 25), 5, async (company) => {
      if (pastDeadline(ctx)) return null;
      const team = await findDecisionMakers(company, roles);
      ctx.log(team.people.length ? `  ${company.domain}: ${team.people.length} named on ${team.source}` : `  ${company.domain}: no public team page`);
      return team;
    });
    const items: ProspectContact[] = teams.filter((t): t is NonNullable<typeof t> => t !== null).flatMap((t) => t.people.map((p) => ({
      id: `ct_${randomUUID().slice(0, 8)}`,
      companyDomain: t.domain,
      name: p.name,
      firstName: p.name.split(/\s+/)[0] ?? null,
      title: p.title,
      email: null,
      confidence: null,
      verification: "named on its own team page",
      linkedinUrl: null,
      source: "company website",
      evidence: t.source ? [{ kind: "page" as const, url: t.source, quote: `${p.name}, ${p.title}`, at }] : [],
    })));
    return {
      ...clearAfter(state, "contacts"),
      contacts: items.length
        ? { status: "found", provider: "company websites", items, searchedDomains: teams.filter(Boolean).length, ranAt: at }
        : { status: "provider_not_configured", provider: null, items: [], searchedDomains: 0, ranAt: at },
    };
  }
  const items: ProspectContact[] = [];
  let searched = 0;
  for (const company of companies.slice(0, 25)) {
    ctx.log(`looking up decision makers at ${company.domain} via ${provider.label}`);
    try {
      const found = await provider.findByDomain(company.domain, roles);
      searched++;
      items.push(...found.slice(0, 3));
      ctx.log(`  ${found.length} people with published business addresses`);
    } catch (error) {
      ctx.log(`  lookup failed (${error instanceof Error ? error.message : "error"})`);
      if (error instanceof Error && error.message === "provider_rate_limited") break;
    }
  }
  return {
    ...clearAfter(state, "contacts"),
    contacts: { status: items.length ? "found" : "no_results", provider: provider.id, items, searchedDomains: searched, ranAt: at },
  };
}

// ---- Step 6: emails ----------------------------------------------------------
export function templateDraft(input: {
  ourName: string;
  ourSummary: string;
  ourUrl: string | null;
  senderName: string;
  company: ProspectCompany;
  contact: ProspectContact | null;
}): { subject: string; body: string; sources: Evidence[]; missing: string[] } {
  const { company, contact } = input;
  const at = now();
  const missing: string[] = [];
  const theirFact = firstSentence(company.description, 180);
  if (!theirFact) missing.push("a fact about the company");
  if (!contact) missing.push("a named contact");
  // Introduce the sender's company: "The system for revenue teams..." from a
  // homepage becomes "Attio is the system for revenue teams...".
  const summaryLine = firstSentence(input.ourSummary, 220);
  const ourLine = !summaryLine
    ? `${input.ourName} may be relevant to your team.`
    : summaryLine.toLowerCase().includes(input.ourName.toLowerCase())
      ? summaryLine
      : /^(the|a|an)\s/i.test(summaryLine)
        ? `${input.ourName} is ${summaryLine.charAt(0).toLowerCase()}${summaryLine.slice(1)}`
        : `${input.ourName}: ${summaryLine}`;
  const greeting = contact?.firstName ? `Hi ${contact.firstName},` : "Hi,";
  const opener = theirFact ? `${company.domain} describes ${company.name} as: "${theirFact.replace(/\.$/, "")}."` : `I came across ${company.name} at ${company.domain}.`;
  const body = [
    greeting,
    "",
    opener,
    "",
    ourLine,
    "",
    `Would a short written overview of how this could apply to ${company.name} be useful?`,
    "",
    input.senderName,
  ].join("\n");
  const sources: Evidence[] = [
    ...company.evidence.filter((e) => e.kind === "page"),
    ...(input.ourUrl ? [{ kind: "page" as const, url: input.ourUrl, quote: "Your homepage", at }] : []),
    ...(contact ? contact.evidence : []),
  ];
  return { subject: `${company.name} and ${input.ourName}`, body, sources, missing };
}

export async function runEmails(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const research = state.research;
  const companies = (state.companies?.items ?? []).filter((c) => c.selected);
  if (!research || !state.contacts) throw new StepBlocked("Find decision makers first.");
  const contacts = state.contacts.items;
  const at = now();
  const items: EmailDraft[] = [];
  const targets = companies.slice(0, 25);
  ctx.log(`writing ${targets.length} draft${targets.length === 1 ? "" : "s"} from the facts collected in steps 1 to 5`);
  for (const company of targets) {
    const contact = contacts.find((c) => c.companyDomain === company.domain) ?? null;
    const draft = templateDraft({
      ourName: research.name,
      ourSummary: research.summary,
      ourUrl: research.page?.finalUrl ?? null,
      senderName: ctx.senderName,
      company,
      contact,
    });
    const custom = await draftCompanyEmail(
      { name: research.name, domain: research.domain, summary: research.summary, category: ctx.brand.category, keywords: research.keywords },
      company,
    );
    const subject = custom.subject;
    const body = contact?.firstName ? custom.body.replace(/^Hi,/, `Hi ${contact.firstName},`) : custom.body;
    const engine: EmailDraft["engine"] = custom.engine === "model" ? "model" : "template";
    items.push({
      id: `drf_${randomUUID().slice(0, 8)}`,
      companyDomain: company.domain,
      contactId: contact?.id ?? null,
      to: contact?.email ?? null,
      subject,
      body,
      engine,
      sources: draft.sources,
      missing: draft.missing,
      updatedAt: at,
    });
    ctx.log(`  drafted for ${company.name}${contact ? ` (${contact.name})` : ""}`);
  }
  return { ...clearAfter(state, "emails"), emails: { items, ranAt: at } };
}

// ---- Public conversations ---------------------------------------------------
export interface SocialSignal {
  platform: "Reddit" | "LinkedIn" | "X";
  title: string;
  url: string;
  snippet: string;
}

const SIGNAL_SOURCES: Array<{ platform: SocialSignal["platform"]; domains: string[] }> = [
  { platform: "Reddit", domains: ["reddit.com"] },
  { platform: "LinkedIn", domains: ["linkedin.com"] },
  { platform: "X", domains: ["x.com", "twitter.com"] },
];

// Public posts that search engines have indexed, where people discuss the
// topic. Search results only: nothing behind a login is read, and no
// profiles are collected.
export async function findSocialSignals(topic: string, log: (t: string) => void, perPlatform = 3): Promise<SocialSignal[]> {
  if (!searchAvailable() || !topic.trim()) return [];
  const out: SocialSignal[] = [];
  for (const source of SIGNAL_SOURCES) {
    const q = `${topic} recommendations`;
    log(`searching public ${source.platform} posts: "${q}"`);
    try {
      const hits = await search(q, perPlatform + 2, { includeDomains: source.domains });
      const posts = hits
        .filter((h) => source.domains.some((d) => h.domain === d || h.domain.endsWith(`.${d}`)))
        .filter((h) => !/\/(in|pub)\//.test(new URL(h.url).pathname))
        .slice(0, perPlatform)
        .map((h) => ({ platform: source.platform, title: h.title.slice(0, 160), url: h.url, snippet: h.content.replace(/\s+/g, " ").slice(0, 240) }));
      out.push(...posts);
      log(`  ${posts.length} public posts`);
    } catch {
      log("  search failed for this platform; continuing");
    }
  }
  return out;
}

export const STEP_RUNNERS: Record<StepId, (state: ProspectingState, ctx: StepContext) => Promise<ProspectingState>> = {
  research: runResearch,
  competitors: runCompetitors,
  campaigns: runCampaigns,
  companies: runCompanies,
  contacts: runContacts,
  emails: runEmails,
};
