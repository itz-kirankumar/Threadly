import { randomUUID } from "node:crypto";
import type { BrandProfile } from "../geo/types.ts";
import { contactProvider } from "./contacts.ts";
import { modelEnabled, modelJson } from "./model.ts";
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
  "tiktok.com", "wikipedia.org", "github.com", "forbes.com", "techcrunch.com", "businessinsider.com", "hubspot.com", "semrush.com",
  "ahrefs.com", "moz.com", "searchengineland.com", "searchenginejournal.com", "zapier.com", "gartner.com", "clutch.co", "upwork.com",
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

export function rootDomain(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
}

function isNonCompany(domain: string): boolean {
  return NON_COMPANY.some((d) => domain === d || domain.endsWith(`.${d}`)) || /(^|\.)(gov|edu|mil)(\.[a-z]{2})?$/.test(domain);
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
export function topicTerms(keywords: string[], category: string): string[] {
  const words = new Set<string>();
  for (const k of [...keywords, category]) for (const w of k.toLowerCase().split(/\s+/)) if (w.length >= 4) words.add(w);
  return [...new Set([...keywords.map((k) => k.toLowerCase()), ...words])];
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
  return [...byDomain.values()]
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
  const checked = await mapLimit(items, 4, async (c): Promise<Competitor | null> => {
    try {
      const page = await fetchPage(c.domain, 6000);
      const description = page.description ?? firstSentence(page.paragraphs[0]);
      const hits = matchedTerms([page.title, description, ...page.headings].filter(Boolean).join(" "), terms);
      if (!c.tracked && hits.length === 0) {
        offTopic.push(c.domain);
        return null;
      }
      return {
        ...c,
        name: c.tracked ? c.name : companyName(page, c.domain),
        description,
        evidence: [...c.evidence, { kind: "page" as const, url: page.finalUrl, quote: hits.length ? `mentions ${hits.slice(0, 3).join(", ")}` : undefined, at: page.fetchedAt }],
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
    competitors: { items: read, queries: searchAvailable() ? queries : [], searchAvailable: searchAvailable(), ranAt: at },
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
        for (const r of results) {
          const d = rootDomain(r.domain);
          if (exclude.has(d) || isNonCompany(d) || candidates.some((c) => c.domain === d)) continue;
          candidates.push({ domain: d, campaignId: campaign.id, ev: { kind: "search", query: q, url: r.url, at } });
          added++;
        }
        ctx.log(`  ${results.length} results, ${added} new company domains`);
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
  const ourLine = firstSentence(input.ourSummary, 220) ?? `${input.ourName} may be relevant to your team.`;
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
    let subject = draft.subject;
    let body = draft.body;
    let engine: EmailDraft["engine"] = "template";
    if (modelEnabled()) {
      const out = await modelJson<{ subject?: string; body?: string }>(
        `Write a short, plain first email (under 120 words) from ${ctx.senderName} at ${research.name} to ${contact?.name ?? "the right person"} at ${company.name}. Reference one fact from THEIRS and one from OURS. End with one low-pressure question. Shape: {"subject":string,"body":string}`,
        { THEIRS: [company.name, company.description ?? ""].join("\n"), OURS: research.summary },
        500,
      );
      if (out?.subject && out.body) {
        subject = out.subject.slice(0, 120);
        body = out.body.slice(0, 2000);
        engine = "model";
      }
    }
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

export const STEP_RUNNERS: Record<StepId, (state: ProspectingState, ctx: StepContext) => Promise<ProspectingState>> = {
  research: runResearch,
  competitors: runCompetitors,
  campaigns: runCampaigns,
  companies: runCompanies,
  contacts: runContacts,
  emails: runEmails,
};
