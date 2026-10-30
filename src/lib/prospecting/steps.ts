import { randomUUID } from "node:crypto";
import type { BrandProfile } from "../geo/types.ts";
import { contactProvider } from "./contacts.ts";
import { modelEnabled, modelJson } from "./model.ts";
import { draftCompanyEmail } from "./social.ts";
import { companyName, extractAudiencePhrases, extractKeywords, firstSentence, matchedTerms, outboundDomains } from "./text.ts";
import type { Campaign, Competitor, Evidence, ProspectCompany, ProspectContact, ProspectingState, EmailDraft, StepId } from "./types.ts";
import { FetchRefused, fetchPage, mapLimit, search, searchAvailable, type SearchHit } from "./web.ts";

export interface StepContext {
  brand: BrandProfile;
  senderName: string;
  log: (text: string) => void;
}

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
  "yahoo.com", "investing.com", "bloomberg.com", "reuters.com", "cnbc.com", "libhunt.com", "rocketreach.co", "tracxn.com",
  "zoominfo.com", "cbinsights.com", "pitchbook.com", "owler.com", "craft.co", "f6s.com", "wellfound.com", "angel.co",
  "dealroom.co", "lusha.com", "signalhire.com", "leadiq.com", "growjo.com", "getlatka.com", "prnewswire.com",
  "businesswire.com", "globenewswire.com", "eventbrite.com", "meetup.com", "coursera.org", "udemy.com",
];

const MAX_COMPETITORS = 15;
const MAX_COMPANIES_PER_CAMPAIGN = 12;

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
  if (page) ctx.log(`extracted ${keywords.length} keywords and ${audiences.length} audience phrases from the page text`);

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
      audiencePhrases: audiences.map((a) => a.phrase),
      // The link list is only needed while mining articles; not stored.
      page: page ? { ...page, links: [] } : null,
      pageError,
      evidence: page ? [{ kind: "page", url: page.finalUrl, at: page.fetchedAt }] : [{ kind: "profile", quote: "Brand profile", at }],
      ranAt: at,
    },
  };
}

// ---- Step 2: competitors ---------------------------------------------------
// Queries anchored on what the company does, not only its name: a name like
// "Threadly" collides with unrelated products of the same name.
export function competitorQueries(domain: string, keywords: string[], category: string, tracked: string[]): string[] {
  const phrases = keywords.filter((k) => k.includes(" "));
  const topic = category.trim() || phrases[0] || keywords[0] || "";
  const qs: string[] = [];
  if (topic) qs.push(`best ${topic} tools`, `${topic} software companies`);
  if (phrases[1] && phrases[1] !== topic) qs.push(`${phrases[1]} platform`);
  if (tracked[0]) qs.push(`${tracked[0]} alternatives`);
  qs.push(`${domain} alternatives`);
  return [...new Set(qs.map((q) => q.trim()).filter(Boolean))].slice(0, 5);
}

// Topic terms a competitor's own homepage must mention to be kept.
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
): Competitor[] {
  const byDomain = new Map<string, Competitor & { score: number }>();
  const touch = (domain: string, weight: number, ev: Evidence) => {
    const d = rootDomain(domain);
    if (!d || d === own || d.endsWith(`.${own}`) || isNonCompany(d)) return;
    const c = byDomain.get(d) ?? { domain: d, name: d, description: null, tracked: tracked.includes(d), selected: true, appearances: 0, evidence: [], score: 0 };
    c.score += weight;
    c.appearances += 1;
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
  const byLabel = new Map<string, Competitor & { score: number }>();
  for (const c of byDomain.values()) {
    const label = c.domain.split(".")[0];
    const prev = byLabel.get(label);
    if (!prev) byLabel.set(label, c);
    else if (c.score > prev.score) byLabel.set(label, { ...c, score: c.score + prev.score, appearances: c.appearances + prev.appearances });
    else prev.score += c.score;
  }
  return [...byLabel.values()]
    .filter((c) => c.tracked || c.score >= 2)
    .sort((a, b) => Number(b.tracked) - Number(a.tracked) || b.score - a.score || a.domain.localeCompare(b.domain))
    .map(({ score: _score, ...c }) => c);
}

export async function runCompetitors(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const research = state.research;
  if (!research) throw new StepBlocked("Research your company first.");
  const at = now();
  const tracked = (ctx.brand.competitors ?? []).map((c) => rootDomain(c.domain || "")).filter(Boolean);
  if (tracked.length) ctx.log(`starting from ${tracked.length} competitors tracked in your brand profile`);

  const queries = competitorQueries(research.domain, research.keywords, ctx.brand.category, tracked);
  const hits: Array<SearchHit & { query: string }> = [];
  if (searchAvailable()) {
    for (const q of queries) {
      ctx.log(`searching the web: "${q}"`);
      try {
        const results = await search(q, 8);
        hits.push(...results.map((r) => ({ ...r, query: q })));
        ctx.log(`  ${results.length} results`);
      } catch {
        ctx.log("  search failed for this query; continuing");
      }
    }
  } else {
    ctx.log("web search is not configured on this deployment; using tracked competitors only");
  }

  // Read the top comparison articles and collect the company sites they link to.
  const articles = hits
    .filter((h) => !isHomepage(h.url) && !isNonCompany(rootDomain(h.domain)) && rootDomain(h.domain) !== research.domain)
    .filter((h, i, all) => all.findIndex((x) => x.url === h.url) === i)
    .slice(0, 6);
  if (articles.length) ctx.log(`reading ${articles.length} comparison articles for the companies they link to`);
  const articleLinks = (
    await mapLimit(articles, 3, async (a) => {
      try {
        const page = await fetchPage(a.url, 8000);
        const domains = outboundDomains(page.links, page.domain).map(rootDomain).filter((d) => !isNonCompany(d));
        ctx.log(`  ${a.domain}: ${domains.length} linked sites`);
        return { url: page.finalUrl, domains };
      } catch (error) {
        ctx.log(`  ${a.domain}: article ${describeError(error)}`);
        return { url: a.url, domains: [] };
      }
    })
  ).filter((a) => a.domains.length);

  let items = rankCompetitorCandidates(hits, research.domain, tracked, at, articleLinks);
  for (const d of tracked) {
    if (!items.some((c) => c.domain === d)) {
      const comp = ctx.brand.competitors.find((c) => rootDomain(c.domain) === d);
      items.unshift({ domain: d, name: comp?.name ?? d, description: null, tracked: true, selected: true, appearances: 0, evidence: [{ kind: "profile", quote: "Tracked in your brand profile", at }] });
    }
  }
  items = items.slice(0, MAX_COMPETITORS + 10);
  ctx.log(`ranked ${items.length} candidate domains; reading their homepages to check relevance`);

  const terms = topicTerms(research.keywords, ctx.brand.category);
  const offTopic: string[] = [];
  const unreachable: string[] = [];
  const audienceTally = new Map<string, { phrase: string; count: number; quote: string; url: string }>();
  const checked = await mapLimit(items, 4, async (c): Promise<Competitor | null> => {
    try {
      const page = await fetchPage(c.domain, 6000);
      const description = page.description ?? firstSentence(page.paragraphs[0]);
      for (const a of extractAudiencePhrases(page, 4)) {
        const key = a.phrase.toLowerCase();
        const prev = audienceTally.get(key);
        audienceTally.set(key, prev ? { ...prev, count: prev.count + 1 } : { phrase: a.phrase, count: 1, quote: a.quote, url: page.finalUrl });
      }
      const hits = onTopic([page.title, description, ...page.headings].filter(Boolean).join(" "), terms);
      // On topic, or one topic word plus independent sources agreeing.
      const loose = matchedTerms([page.title, description, ...page.headings].filter(Boolean).join(" "), terms);
      const relevant = hits.length > 0 || (loose.length > 0 && c.appearances >= 2);
      if (!c.tracked && (!relevant || INTERSTITIAL.test(page.title ?? ""))) {
        offTopic.push(c.domain);
        return null;
      }
      return {
        ...c,
        name: c.tracked ? c.name : companyName(page, c.domain),
        description,
        evidence: [...c.evidence, { kind: "page" as const, url: page.finalUrl, quote: (hits.length ? hits : loose).length ? `mentions ${(hits.length ? hits : loose).slice(0, 3).join(", ")}` : undefined, at: page.fetchedAt }],
      };
    } catch (error) {
      if (c.tracked) ctx.log(`  ${c.domain}: homepage ${describeError(error)}; kept because you track it`);
      else unreachable.push(c.domain);
      return c.tracked ? c : null;
    }
  });
  const sample = (list: string[]) => `${list.slice(0, 4).join(", ")}${list.length > 4 ? ` and ${list.length - 4} more` : ""}`;
  if (offTopic.length) ctx.log(`  dropped ${offTopic.length} whose homepage does not mention your topic: ${sample(offTopic)}`);
  if (unreachable.length) ctx.log(`  dropped ${unreachable.length} whose homepage could not be read: ${sample(unreachable)}`);
  const read = checked.filter((c): c is Competitor => c !== null).slice(0, MAX_COMPETITORS);
  ctx.log(`kept ${read.length} competitors whose homepages match your topic`);

  return {
    ...clearAfter(state, "competitors"),
    competitors: {
      items: read,
      audiences: [...audienceTally.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      queries: searchAvailable() ? queries : [],
      searchAvailable: searchAvailable(),
      ranAt: at,
    },
  };
}

// ---- Step 3: campaigns -----------------------------------------------------
const DEFAULT_ROLES = ["Founder", "CEO", "Head of Marketing", "Head of Growth"];

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function campaignsFromAudiences(audiences: Array<{ phrase: string; quote: string }>, url: string | undefined, at: string): Campaign[] {
  return audiences.map((a) => ({
    id: `cmp_${randomUUID().slice(0, 8)}`,
    name: titleCase(a.phrase),
    description: `Your site names this audience: "${a.quote.length > 160 ? `${a.quote.slice(0, 157)}...` : a.quote}"`,
    searchQuery: `${a.phrase} companies`,
    roles: DEFAULT_ROLES,
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
  ctx.log(`found ${audiences.length} audience statements on your homepage`);
  let items = campaignsFromAudiences(audiences, page?.finalUrl, at);

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
  // No audience named on the site: use the audience competitors name most on
  // their own homepages (who the category sells to), with the quote.
  const theirs = state.competitors.audiences?.[0];
  if (!items.length && theirs) {
    items.push({
      id: `cmp_${randomUUID().slice(0, 8)}`,
      name: titleCase(theirs.phrase),
      description: `Named by ${theirs.count} competitor homepage${theirs.count === 1 ? "" : "s"}: "${theirs.quote.length > 140 ? `${theirs.quote.slice(0, 137)}...` : theirs.quote}"`,
      searchQuery: /compan|startup|firm|agenc|business|brand/i.test(theirs.phrase) ? theirs.phrase : `${theirs.phrase} companies`,
      roles: DEFAULT_ROLES,
      source: "homepage",
      evidence: [{ kind: "page", url: theirs.url, quote: theirs.quote, at }],
      selected: true,
    });
    ctx.log(`your homepage names no audience; using "${theirs.phrase}", which your competitors name`);
  }
  // Still nothing: propose one campaign from the site's own top keyword
  // phrase, labelled as such, so the run can continue.
  const phrase = ctx.brand.category.trim() || research.keywords.find((k) => k.includes(" ")) || research.keywords[0];
  if (!items.length && phrase) {
    items.push({
      id: `cmp_${randomUUID().slice(0, 8)}`,
      name: titleCase(`Companies that need ${phrase}`),
      description: `Suggested from "${phrase}" on your homepage. Edit it to describe who you sell to.`,
      searchQuery: `companies investing in ${phrase}`,
      roles: DEFAULT_ROLES,
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
  // Fit evidence for a prospect is the campaign's own vocabulary found on
  // the prospect's homepage.
  const campaignTerms = new Map(campaigns.map((c) => [c.id, campaignVocabulary(c)]));
  const queries: string[] = [];
  const candidates: Array<{ domain: string; campaignId: string; ev: Evidence }> = [];

  for (const campaign of campaigns) {
    const base = campaign.searchQuery.trim();
    const qs = [base, /compan|startup|firm|agenc/i.test(base) ? `top ${base}` : `${base} companies`];
    for (const q of qs) {
      queries.push(q);
      ctx.log(`searching the web for ${campaign.name}: "${q}"`);
      try {
        const results = await search(q, 10);
        let added = 0;
        const add = (domain: string, ev: Evidence) => {
          const d = rootDomain(domain);
          if (!d || exclude.has(d) || brands.has(d.split(".")[0]) || isNonCompany(d) || candidates.some((c) => c.domain === d)) return;
          candidates.push({ domain: d, campaignId: campaign.id, ev });
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
  const read = await mapLimit(limited, 4, async (c): Promise<ProspectCompany | null> => {
    try {
      const page = await fetchPage(c.domain, 6000);
      if (INTERSTITIAL.test(page.title ?? "") || isNonCompany(rootDomain(page.domain))) {
        skipped.push({ domain: c.domain, reason: "not a company homepage" });
        return null;
      }
      const description = page.description ?? firstSentence(page.paragraphs[0]);
      const text = [page.title, description, ...page.headings].filter(Boolean).join(" ");
      return {
        domain: c.domain,
        name: companyName(page, c.domain),
        description,
        campaignId: c.campaignId,
        matchedTerms: matchedTerms(text, campaignTerms.get(c.campaignId) ?? []).slice(0, 5),
        selected: true,
        evidence: [c.ev, { kind: "page", url: page.finalUrl, at: page.fetchedAt }],
      };
    } catch (error) {
      skipped.push({ domain: c.domain, reason: describeError(error) });
      return null;
    }
  });
  const items = read.filter((c): c is ProspectCompany => c !== null);
  ctx.log(`kept ${items.length} companies; ${skipped.length} skipped (unreachable or disallowed)`);
  return { ...clearAfter(state, "companies"), companies: { items, queries, skipped, ranAt: at } };
}

// ---- Step 5: decision makers -------------------------------------------------
export async function runContacts(state: ProspectingState, ctx: StepContext): Promise<ProspectingState> {
  const companies = (state.companies?.items ?? []).filter((c) => c.selected);
  if (!state.companies) throw new StepBlocked("Find potential customers first.");
  if (!companies.length) throw new StepBlocked("Select at least one company.");
  const at = now();
  const provider = contactProvider();
  if (!provider) {
    ctx.log("no licensed contact data provider is configured; contacts are not scraped or guessed");
    return { ...clearAfter(state, "contacts"), contacts: { status: "provider_not_configured", provider: null, items: [], searchedDomains: 0, ranAt: at } };
  }
  const roles = [...new Set((state.campaigns?.items ?? []).filter((c) => c.selected).flatMap((c) => c.roles))];
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
