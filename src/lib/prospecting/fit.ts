// Whether Threadly serves a business today, and which plays help it grow.
//
// Threadly starts with small digital businesses: software and apps,
// agencies, online stores, online education and other online services, with
// a team of up to about 200 people. A run first reads what the business is
// and how big it is from public evidence (its own pages, Wikidata and
// Wikipedia, public company profiles that name it) and stops when it is a
// large company or not a digital business. Every conclusion lists the facts
// behind it with their sources; with no evidence of size, a business is
// treated as small.

import { termsIn } from "./text.ts";
import type { PageSnapshot } from "./types.ts";
import { BOT_UA, fetchPage, mapLimit, search, searchAvailable, type SearchHit } from "./web.ts";

export const SMALL_TEAM_MAX = 200;

export type SellsTo = "businesses" | "local businesses" | "consumers";
export type BusinessKind = "software" | "agency" | "online store" | "online education" | "online service" | "physical business";

export interface FitFact {
  label: string;
  value: string;
  source: string;
  url: string | null;
}

export interface SizeStatement {
  count: number;
  label: string;
  source: string;
  url: string | null;
  // 3: Wikidata or a profile that names the domain; 2: names the company and
  // its category, or its own about page; 1: a LinkedIn member count, which
  // namesakes inflate. Only the highest level present decides.
  confidence: 1 | 2 | 3;
}

export interface BusinessFit {
  inSegment: boolean;
  kind: BusinessKind;
  sellsTo: SellsTo[];
  // Local business types it sells to ("dentists"), when it serves them.
  localTypes: string[];
  team: SizeStatement | null;
  size: "small" | "mid-sized" | "large" | "unknown";
  listed: string | null;
  outlets: number | null;
  place: { city: string | null; country: string | null };
  reason: string;
  facts: FitFact[];
  // Public sources read to decide: pages, search results, Wikidata.
  sources: number;
}

export interface WikidataFacts {
  id: string;
  label: string;
  description: string | null;
  employees: number | null;
  listed: string | null;
  instanceOf: string[];
  industry: string[];
  hq: string | null;
  country: string | null;
  summary: string | null;
  url: string;
}

export interface FitEvidence {
  name: string;
  domain: string;
  category: string | null;
  terms: string[];
  pages: Array<{ url: string; kind: "home" | "about" | "other"; text: string }>;
  html: string;
  location: string | null;
  wikidata: WikidataFacts | null;
  hits: SearchHit[];
  sources: number;
}

// ---- Reading sizes and kinds from text ----------------------------------------

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|thousand|lakh)?`;

function num(n: string, unit?: string): number {
  let v = Number(n.replace(/,/g, ""));
  if (unit && /^(k|thousand)$/i.test(unit)) v *= 1000;
  if (unit && /^lakh$/i.test(unit)) v *= 100_000;
  return Math.round(v);
}

const flat = (s: string) => s.replace(/[#*|]+/g, " ").replace(/\s+/g, " ").trim();

// Team-size statements in one text. Customer counts, followers and member
// counts on LinkedIn are kept apart from employee counts.
export function sizeStatements(raw: string, source: string, url: string | null, confidence: 2 | 3, own = false): SizeStatement[] {
  const text = flat(raw);
  const out: SizeStatement[] = [];
  const add = (count: number, label: string, level: 1 | 2 | 3) => {
    if (count > 1 && count < 5_000_000 && !out.some((s) => s.count === count)) out.push({ count, label, source, url, confidence: level });
  };
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:employees|headcount)\s*-?\s*now\s*:\s*${NUM}`, "gi"))) add(num(m[1], m[2]), `${m[1]} people list it on LinkedIn`, 1);
  for (const m of text.matchAll(new RegExp(String.raw`${NUM}\s+(?:employees|associated members)\s+on\s+linkedin`, "gi"))) add(num(m[1], m[2]), `${m[1]} people list it on LinkedIn`, 1);
  if (own) {
    // A company's own about or careers page: "we're a team of 12". Customer
    // quotes on homepages are not read for size.
    for (const m of text.matchAll(new RegExp(String.raw`\b(?:we(?:'re|’re| are)(?: now)?(?: an?)?(?: \w+)?|our(?: \w+)?|with (?:a|our)(?: \w+)?)\s+(?:team|crew) of (?:just |only |about |around |over |more than )?${NUM}`, "gi"))) add(num(m[1], m[2]), `team of ${m[1]}`, confidence);
    for (const m of text.matchAll(new RegExp(String.raw`${NUM}\+?\s+(?:employees|people|team members|staff)\s+(?:worldwide|globally|across|around the world)`, "gi"))) add(num(m[1], m[2]), `${m[1]}${m[0].includes("+") ? "+" : ""} employees`, confidence);
    return out;
  }
  for (const m of text.matchAll(new RegExp(String.raw`${NUM}\s*(?:-|–|to)\s*${NUM}\s+employees\b`, "gi"))) {
    const lo = num(m[1], m[2]);
    const hi = num(m[3], m[4]);
    if (hi > lo) add(Math.round((lo + hi) / 2), `${m[1]}-${m[3]} employees`, confidence);
  }
  for (const m of text.matchAll(new RegExp(String.raw`${NUM}\+\s+employees\b`, "gi"))) add(num(m[1], m[2]), `${m[1]}+ employees`, confidence);
  for (const m of text.matchAll(new RegExp(String.raw`\bhas (?:approximately |about |around |over |more than |nearly |roughly )?${NUM}\+?\s+(?:total |full[- ]time |active )?(?:employees|staff)\b`, "gi"))) add(num(m[1], m[2]), `${m[1]} employees`, confidence);
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:number of employees|employee count|team size(?: of)?|total employees|employees)\s*(?::|-|–|is|of|was)?\s*(?:approximately |about |around |over |~)?${NUM}(?!\s*(?:%|percent|followers|customers|users|countries|cities|stores|outlets|-|–))`, "gi"))) {
    if (/now\s*:?\s*$/i.test(text.slice(Math.max(0, (m.index ?? 0) - 6), m.index))) continue;
    add(num(m[1], m[2]), `${m[1]} employees`, confidence);
  }
  for (const m of text.matchAll(new RegExp(String.raw`\bwith a (?:small |tiny |lean )?team of (?:just |only |about )?${NUM}`, "gi"))) add(num(m[1], m[2]), `team of ${m[1]}`, confidence);
  return out;
}

// Physical locations the business operates: "850+ stores in over 95 cities",
// "our 120 outlets". "Trusted by 5,000 restaurants" counts customers, not
// locations, and is skipped.
export function outletCount(raw: string): number | null {
  const text = flat(raw);
  const PLACES = "outlets|stores|restaurants|kiosks|branches|showrooms|cafes|cafés|clinics|hospitals|hotels|schools|centres|centers|locations";
  let best: number | null = null;
  const seen = (n: number) => { best = Math.max(best ?? 0, n); };
  for (const m of text.matchAll(new RegExp(String.raw`(.{0,30})\b${NUM}\+?\s+(?:${PLACES})\s+(?:in|across)\s+(?:over |more than )?\d+\+?\s+(?:cities|states|countries)`, "gi"))) {
    if (!/(trusted|used|loved|chosen) by|powering|serving|helping|join|for\s*$/i.test(m[1])) seen(num(m[2], m[3]));
  }
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:our|operates|operating|runs|network of|chain of)\s+(?:over |more than )?${NUM}\+?\s+(?:${PLACES})\b`, "gi"))) seen(num(m[1], m[2]));
  return best;
}

// A stock listing stated next to the company's own name ("Zoho (NSE: X)",
// "Acme is publicly traded"); comparison pages name other companies' tickers.
export function listedOn(raw: string, name: string): string | null {
  const text = flat(raw);
  const key = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const near = new RegExp(`${key}(?:,? (?:Inc|Corp|Corporation|Ltd|Limited|Technologies)\\.?)?\\s*\\(\\s*(NYSE|NASDAQ|Nasdaq|NSE|BSE|LSE|TSX|ASX)\\s*:\\s*[A-Z][A-Z0-9.]{0,9}\\b`, "i").exec(text);
  if (near) return near[1].toUpperCase();
  // A statement, not an FAQ heading ("Is Zoho publicly traded?").
  const phrase = new RegExp(`${key}[^.?]{0,60}?\\b(?:is|became|went) (?:a )?(?:publicly (?:traded|listed)|public company|listed on the (NYSE|Nasdaq|NASDAQ|NSE|BSE|London Stock Exchange|National Stock Exchange|Bombay Stock Exchange))\\b(?![^.]{0,3}\\?)`, "i").exec(text);
  if (phrase && !/\bnot\b/i.test(phrase[0])) return phrase[1] ?? "a stock exchange";
  return null;
}

const PHYSICAL = /\b(restaurants?|restaurant chain|fast food|qsr|quick[- ]service|food (?:chain|and beverage|& beverage)|caf[eé] chain|dine[- ]in|hospitality|hotels?|resorts?|hospitals?|multi[- ]speciality|dental clinic|clinics? chain|schools?|colleges?|universit(?:y|ies)|manufactur(?:er|ers|ing)|factor(?:y|ies)|industrial|construction|real estate develop\w*|builders and developers|airlines?|aviation|automotive|automobiles?|steel|cement|mining|oil and gas|petroleum|utilities|retail chain|supermarkets?|hypermarkets?|department stores?|textiles?|pharmaceuticals? (?:company|manufacturer)|aerospace|spacecraft|rockets?|logistics company|conglomerate)\b/gi;
const PHYSICAL_BODY = /\b(store locator|find (?:a|an|your nearest) (?:store|restaurant|outlet|branch|showroom)|stores? near (?:you|me)|outlets? near (?:you|me)|book a table|dine[- ]in|franchise (?:enquiry|inquiry|opportunit\w+)|own a franchise|visit our (?:store|showroom|outlet)|manufacturing (?:facility|plant|unit))\b/gi;
const DIGITAL = /\b(software|saas|platform|apps?|application|tools?|api|sdk|crm|erp|automation|ai (?:agent|assistant|tool|platform)|chatbot|no[- ]code|plugin|extension|templates?|website builder|e-?commerce|online (?:store|shop|courses?|platform|service|marketplace|community)|marketplace|digital (?:agency|marketing|products?)|(?:marketing|design|seo|branding|creative|web|development|advertising|social media|performance marketing|growth) agency|agency|newsletter|courses?|bootcamp|e-learning|internet|it services|software development|technology, information|web design|marketing services|advertising services)\b/gi;
const DIGITAL_BODY = /\b(start (?:your )?free trial|start for free|sign up (?:for )?free|get started (?:for )?free|try (?:it )?(?:for )?free|book a demo|request a demo|schedule a demo|\/mo\b|per month|per user|integrations|api docs|add to cart|shop now|buy now|free shipping|enroll now|join the (?:course|cohort)|our services)\b/gi;

const count = (re: RegExp, text: string) => [...text.matchAll(re)].length;

// What kind of business the evidence describes. Descriptions written about
// it (Wikidata, Wikipedia, profile industries, its category) count three
// times; its title and headings twice; strong phrases in its body once.
export function businessKind(input: { described: string; headline: string; body: string; html?: string }): { kind: BusinessKind; physical: number; digital: number } {
  const physical = count(PHYSICAL, input.described) * 3 + count(PHYSICAL, input.headline) * 2 + count(PHYSICAL_BODY, input.body) * 2;
  const digital = count(DIGITAL, input.described) * 3 + count(DIGITAL, input.headline) * 2 + Math.min(6, count(DIGITAL_BODY, input.body));
  const all = `${input.described} ${input.headline}`.toLowerCase();
  const shop = /cdn\.shopify\.com|woocommerce|add[- ]to[- ]cart/i.test(`${input.html ?? ""} ${input.body}`);
  if (physical >= 4 && physical > digital * 1.5) return { kind: "physical business", physical, digital };
  const kind: BusinessKind = /\bagenc(?:y|ies)\b|\bstudio\b|\bconsultancy\b/.test(all) ? "agency"
    : /\b(software|saas|platform|app|apps|tool|tools|api|crm|erp|automation|extension|plugin)\b/.test(all) ? "software"
    : shop ? "online store"
    : /\b(courses?|bootcamp|cohort|academy|e-learning|learn)\b/.test(all) ? "online education"
    : "online service";
  return { kind, physical, digital };
}

// Local business types a business sells to, from its own words.
const LOCAL_TYPES: Array<[RegExp, string]> = [
  [/restaurants?|eateries/, "restaurants"], [/caf[eé]s?\b|coffee shops?/, "cafes"], [/bakeries|bakery/, "bakeries"],
  [/salons?|barbers?(?:hops?)?|beauty parlou?rs?/, "salons"], [/spas?\b/, "spas"], [/dentists?|dental (?:clinics?|practices?)/, "dentists"],
  [/clinics?|doctors?|physicians?|medical practices?/, "clinics"], [/physiotherap\w*|chiropractors?/, "physiotherapists"],
  [/gyms?\b|fitness studios?|fitness centres?|yoga studios?/, "gyms"], [/hotels?|homestays?|guest ?houses?/, "hotels"],
  [/real estate agents?|realtors?|property dealers?|brokers?/, "real estate agents"], [/contractors?|plumbers?|electricians?|roofers?|hvac|home services/, "home service contractors"],
  [/law firms?|lawyers?|attorneys?|advocates?/, "law firms"], [/accountants?|ca firms?|chartered accountants?|bookkeepers?/, "accountants"],
  [/coaching (?:centres?|centers?|institutes?)|tuition (?:centres?|classes)|tutors?/, "coaching centres"], [/car dealers?|dealerships?|auto repair|garages?|mechanics?/, "car dealers and garages"],
  [/veterinar\w*|vets?\b|pet (?:shops?|stores?|groomers?)/, "pet care businesses"], [/retail(?:ers| stores?)|boutiques?|shops?\b|kirana stores?|local stores?/, "retail stores"],
  [/pharmac\w+|chemists?/, "pharmacies"], [/event venues?|wedding planners?|banquet halls?/, "event venues"], [/travel agen\w+|tour operators?/, "travel agencies"],
];
const LOCAL_CONTEXT = /\b(?:for|helps?|helping|built for|made for|designed for|tailored for|(?:trusted|used|loved) by (?:over |more than )?[\d,.]+\+?k?|serving|we serve|we work with|clients include|grow your|more customers for)\s+(?:local |small |independent |busy )?((?:[a-z]+\s){0,2}[a-z]+)/gi;
const LOCAL_WORDS = /\b(local businesses|local seo|google business profile|google my business|google reviews|brick[- ]and[- ]mortar|foot traffic|walk-?ins|near me searches)\b/i;

export function localTypesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(LOCAL_CONTEXT)) {
    const phrase = m[1].toLowerCase();
    for (const [re, label] of LOCAL_TYPES) if (new RegExp(`\\b(?:${re.source})\\b`).test(phrase)) out.add(label);
  }
  return [...out];
}

export function sellsToIn(text: string, kind: BusinessKind, localTypes: string[]): SellsTo[] {
  const out: SellsTo[] = [];
  const b2b = /\b(for (?:teams|businesses|companies|startups|agencies|enterprises|brands|marketers|founders|developers|sales teams|saas|b2b|small businesses|smbs)|b2b|book a demo|request a demo|schedule a demo|talk to sales|contact sales|per seat|per user|soc ?2|sso|saml|your team|workspace|our clients|case studies)\b/i.test(text);
  const b2c = /\b(add to cart|shop now|buy now|free shipping|cash on delivery|for (?:women|men|kids|babies|moms|parents|students|learners|everyone)|your (?:skin|hair|body|baby|pet)|enroll now)\b/i.test(text);
  const local = localTypes.length > 0 || LOCAL_WORDS.test(text) || (kind === "agency" && /\bsmall businesses|local\b/i.test(text));
  if (b2b || kind === "agency" || kind === "software") out.push("businesses");
  if (local) out.push("local businesses");
  if (b2c || kind === "online store" || kind === "online education") out.push("consumers");
  if (!out.length) out.push("businesses");
  // A consumer store is not also a B2B seller because its footer says "for
  // businesses"; keep both only when B2B words are clearly present.
  return kind === "online store" && !/\b(wholesale|bulk orders|for businesses|corporate gifting)\b/i.test(text) ? out.filter((s) => s !== "businesses") : out;
}

const CITY = /\b(?:[Hh]eadquarter(?:s|ed)(?: is| are)?(?: in| at|:)?|[Bb]ased in|HQ:?|[Ll]ocated in)\s+([A-Z][\p{L}.' -]{2,30}?)(?:,\s*([A-Z][\p{L} ]{2,30}))?(?=[.;,)\n]|\s+(?:and|with|since|in)\b|$)/u;

export function placeIn(texts: string[], schemaLocation: string | null): { city: string | null; country: string | null } {
  if (schemaLocation) {
    const [city, country] = schemaLocation.split(/,\s*/);
    if (city) return { city, country: country ?? null };
  }
  for (const t of texts) {
    const m = flat(t).match(CITY);
    if (m && !/^(the|a|an|our|your)\b/i.test(m[1])) return { city: m[1].trim(), country: m[2]?.trim() ?? null };
  }
  return { city: null, country: null };
}

// ---- The decision -----------------------------------------------------------------

const article = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);

export function assessFit(ev: FitEvidence): BusinessFit {
  const facts: FitFact[] = [];
  const statements: SizeStatement[] = [];
  const wd = ev.wikidata;
  if (wd) {
    facts.push({ label: "Wikidata", value: [wd.label, wd.description].filter(Boolean).join(": "), source: "Wikidata", url: wd.url });
    if (wd.employees) statements.push({ count: wd.employees, label: `${wd.employees.toLocaleString("en-US")} employees`, source: "Wikidata", url: wd.url, confidence: 3 });
  }
  for (const p of ev.pages) if (p.kind === "about") statements.push(...sizeStatements(p.text, "its own site", p.url, 2, true));
  for (const h of ev.hits) {
    const text = `${h.title} ${h.content}`;
    const level = text.toLowerCase().includes(ev.domain) || h.url.toLowerCase().includes(ev.domain) ? 3 : 2;
    statements.push(...sizeStatements(text, h.domain, h.url, level));
  }
  // The weighted median of every credible statement (Wikidata and profiles
  // that name the domain count twice), so one stray profile cannot decide.
  // LinkedIn member counts, which namesakes inflate, never decide.
  const pool = statements.filter((s) => s.confidence >= 2).flatMap((s) => (s.confidence === 3 ? [s, s] : [s])).sort((a, b) => a.count - b.count);
  const median = pool.length ? pool[Math.floor((pool.length - 1) / 2)] : null;
  // A chain with 400 outlets does not have 2 employees: such a count is
  // about something else and is dropped.
  const outletsSeen = outletCount([...ev.pages.map((p) => p.text), wd?.summary ?? "", ...ev.hits.map((h) => h.content)].join("\n"));
  const team = median && outletsSeen && median.count < outletsSeen ? null : median;
  if (team) facts.push({ label: "Team size", value: team.label, source: team.source, url: team.url });

  const ownText = ev.pages.map((p) => p.text).join("\n");
  const outsideText = ev.hits.map((h) => `${h.title} ${h.content}`).join("\n");
  const listed = wd?.listed ?? listedOn(outsideText, ev.name) ?? listedOn(ownText, ev.name);
  if (listed) facts.push({ label: "Listed", value: `on ${listed}`, source: wd?.listed ? "Wikidata" : "public profiles", url: wd?.url ?? null });
  const outlets = outletCount(ownText) ?? outletCount(`${wd?.summary ?? ""} ${outsideText}`);
  if (outlets) facts.push({ label: "Physical locations", value: `${outlets.toLocaleString("en-US")}+`, source: "public pages", url: null });

  const home = ev.pages.find((p) => p.kind === "home");
  const industries = [...ev.hits.flatMap((h) => [...`${h.content}`.matchAll(/\bIndustry\s*:\s*([^\n:]{3,60}?)(?=\s+(?:Type|Company type|Headquarters|LinkedIn|Founded|Social)\b|\n|$)/g)].map((m) => m[1])), ...(wd?.industry ?? [])];
  const described = [ev.category, wd?.description, ...(wd?.instanceOf ?? []), wd?.summary?.split(/(?<=\.)\s/)[0], ...industries].filter(Boolean).join(". ");
  const headline = home ? home.text.split("\n").slice(0, 8).join(". ") : "";
  const { kind } = businessKind({ described, headline, body: ownText, html: ev.html });
  const localTypes = localTypesIn(ownText);
  const sellsTo = sellsToIn(ownText, kind, localTypes);
  if (industries[0]) facts.push({ label: "Industry", value: industries[0], source: "public profile", url: null });
  const place = placeIn([ownText, ...ev.hits.map((h) => h.content)],ev.location ?? (wd?.hq ? [wd.hq, wd.country].filter(Boolean).join(", ") : null));

  const size: BusinessFit["size"] = listed || (team && team.count > 1000) ? "large" : team && team.count > SMALL_TEAM_MAX ? "mid-sized" : team ? "small" : "unknown";
  const physical = kind === "physical business" || (outlets !== null && outlets >= 20 && kind !== "software");
  const inSegment = !physical && size !== "large" && size !== "mid-sized";
  const reason = physical
    ? `${ev.name} is ${article(wd?.description ?? industries[0]?.toLowerCase() ?? ev.category ?? "physical business")}${outlets ? ` with ${outlets.toLocaleString("en-US")}+ locations` : ""}, not a digital business.`
    : listed
      ? `${ev.name} is a listed company (${listed}).`
      : size === "large" || size === "mid-sized"
        ? `${ev.name} has about ${team!.count.toLocaleString("en-US")} employees (${team!.source}).`
        : `${ev.name} is a ${size === "small" ? "small " : ""}${kind} selling to ${sellsTo.join(" and ")}${team ? ` (${team.label}, ${team.source})` : ""}.`;
  return { inSegment, kind: physical ? "physical business" : kind, sellsTo, localTypes, team, size, listed, outlets, place, reason, facts, sources: ev.sources };
}

// ---- Gathering the evidence --------------------------------------------------------

const DATA_SITES = ["linkedin.com", "crunchbase.com", "tracxn.com", "getlatka.com", "growjo.com", "zoominfo.com", "cbinsights.com", "pitchbook.com", "rocketreach.co", "craft.co", "owler.com", "reveliolabs.com", "wikipedia.org", "theorg.com", "ambitionbox.com"];

async function wikidataApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: "json", ...params })}`, { headers: { "User-Agent": BOT_UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } }; qualifiers?: Record<string, Array<{ datavalue?: { value?: { time?: string } } }>>; rank?: string };
type Entity = { id: string; labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }>; claims?: Record<string, Claim[]>; sitelinks?: Record<string, { title: string }> };

const rootOf = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/:?#].*$/, "");

// The Wikidata item whose official website is this domain, with its
// employees, stock exchange, kind, industry and headquarters.
export async function wikidataFacts(name: string, domain: string): Promise<WikidataFacts | null> {
  const found = (await wikidataApi({ action: "wbsearchentities", search: name, language: "en", limit: "7", type: "item" })) as { search?: Array<{ id: string }> };
  const ids = (found.search ?? []).map((s) => s.id);
  if (!ids.length) return null;
  const got = (await wikidataApi({ action: "wbgetentities", ids: ids.join("|"), props: "claims|labels|descriptions|sitelinks", languages: "en", sitefilter: "enwiki" })) as { entities?: Record<string, Entity> };
  const entity = Object.values(got.entities ?? {}).find((e) => (e.claims?.P856 ?? []).some((c) => typeof c.mainsnak?.datavalue?.value === "string" && rootOf(c.mainsnak.datavalue.value as string) === domain));
  if (!entity) return null;
  const qids = (p: string) => (entity.claims?.[p] ?? []).map((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id).filter((x): x is string => Boolean(x));
  const want = [...new Set([...qids("P31"), ...qids("P452"), ...qids("P414"), ...qids("P159"), ...qids("P17")])].slice(0, 40);
  const labels = want.length ? ((await wikidataApi({ action: "wbgetentities", ids: want.join("|"), props: "labels", languages: "en" })) as { entities?: Record<string, Entity> }).entities ?? {} : {};
  const label = (id: string) => labels[id]?.labels?.en?.value ?? null;
  const staff = (entity.claims?.P1128 ?? [])
    .map((c) => ({ n: Number(String((c.mainsnak?.datavalue?.value as { amount?: string } | undefined)?.amount ?? "").replace("+", "")), at: c.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? "", rank: c.rank }))
    .filter((x) => x.n > 0)
    .sort((a, b) => Number(b.rank === "preferred") - Number(a.rank === "preferred") || b.at.localeCompare(a.at));
  let summary: string | null = null;
  const title = entity.sitelinks?.enwiki?.title;
  if (title) {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, { headers: { "User-Agent": BOT_UA }, signal: AbortSignal.timeout(6000) });
      if (res.ok) summary = ((await res.json()) as { extract?: string }).extract ?? null;
    } catch {
      // no summary
    }
  }
  return {
    id: entity.id,
    label: entity.labels?.en?.value ?? name,
    description: entity.descriptions?.en?.value ?? null,
    employees: staff[0]?.n ?? null,
    listed: qids("P414").map(label).find(Boolean) ?? null,
    instanceOf: qids("P31").map(label).filter((x): x is string => Boolean(x)),
    industry: qids("P452").map(label).filter((x): x is string => Boolean(x)),
    hq: qids("P159").map(label).find(Boolean) ?? null,
    country: qids("P17").map(label).find(Boolean) ?? null,
    summary,
    url: `https://www.wikidata.org/wiki/${entity.id}`,
  };
}

// A result is about this company when it names the domain, or names the
// company together with one of its category words (namesakes share names,
// not categories).
export function aboutThisCompany(hit: Pick<SearchHit, "title" | "content" | "url">, name: string, domain: string, terms: string[]): boolean {
  const text = `${hit.title} ${hit.content}`.toLowerCase();
  if (text.includes(domain) || hit.url.toLowerCase().includes(domain)) return true;
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "[^a-z0-9]{0,2}");
  if (!key || !new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`).test(text)) return false;
  return terms.length > 0 && termsIn(text, terms).length > 0;
}

const ABOUT_PATH = /\/(about|about-us|company|our-story|who-we-are|team|careers|jobs)(\/|$)/i;

export async function gatherFitEvidence(input: { name: string; domain: string; category: string | null; terms: string[]; home: PageSnapshot | null; html: string; location: string | null; log: (t: string) => void }): Promise<FitEvidence> {
  const { name, domain, log } = input;
  const pages: FitEvidence["pages"] = [];
  let sources = 0;
  if (input.home) {
    pages.push({ url: input.home.finalUrl, kind: "home", text: [input.home.title, input.home.description, ...input.home.headings, ...input.home.paragraphs].filter(Boolean).join("\n") });
    sources++;
  }
  const own = [...new Set([...(input.home?.links ?? []).filter((l) => rootOf(l) === domain && ABOUT_PATH.test(new URL(l).pathname)), `https://${domain}/about`, `https://${domain}/careers`])].slice(0, 6);
  const queries: Array<{ q: string; includeDomains?: string[] }> = [
    { q: `"${name}" company size employees` },
    { q: `${name} ${domain} employees headquarters` },
    { q: `${name} number of employees revenue`, includeDomains: DATA_SITES },
    { q: `${name} company profile industry`, includeDomains: ["linkedin.com", "crunchbase.com", "tracxn.com", "getlatka.com", "wikipedia.org"] },
    { q: `${name} ${domain}` },
    { q: `${name} stores outlets cities` },
  ];
  log(`checking who ${name} is: ${own.length} of its own pages, Wikidata and ${queries.length} public searches`);
  const [ownPages, wikidata, results] = await Promise.all([
    mapLimit(own, 4, async (url) => {
      try {
        const p = await fetchPage(url, 5000);
        if (pages.some((x) => x.url === p.finalUrl)) return null;
        return { url: p.finalUrl, kind: ABOUT_PATH.test(new URL(p.finalUrl).pathname) ? ("about" as const) : ("other" as const), text: [p.title, p.description, ...p.headings, ...p.paragraphs].filter(Boolean).join("\n") };
      } catch {
        return null;
      }
    }),
    wikidataFacts(name, domain).catch(() => null),
    searchAvailable()
      ? mapLimit(queries, 3, async ({ q, includeDomains }) => (await search(q, 20, includeDomains ? { includeDomains } : {}).catch(() => [] as SearchHit[])))
      : Promise.resolve([] as SearchHit[][]),
  ]);
  for (const p of ownPages) if (p) pages.push(p);
  sources += ownPages.filter(Boolean).length + (wikidata ? 1 : 0);
  const all = results.flat();
  sources += all.length;
  const seen = new Set<string>();
  const hits = all.filter((h) => {
    if (seen.has(h.url) || rootOf(h.url) === domain) return false;
    seen.add(h.url);
    return aboutThisCompany(h, name, domain, input.terms);
  });
  log(`  read ${sources} public sources; ${hits.length} results are about ${name}${wikidata ? `; Wikidata: ${wikidata.label}` : ""}`);
  return { name, domain, category: input.category, terms: input.terms, pages, html: input.html, location: input.location, wikidata, hits, sources };
}

// ---- The plan -------------------------------------------------------------------------

export type PlayStep = "crawler" | "competitors" | "campaigns" | "companies" | "local" | "social" | "contacts" | "pitch";

export interface Play {
  step: PlayStep;
  why: string;
}

// The plays that help this business grow, in order. Every business gets
// its AI readiness, its competitors and the people asking for what it
// sells; companies and decision makers when it sells to businesses; local
// businesses from the map when it sells to them.
export function planFor(fit: BusinessFit, maps: { label: string } | null): Play[] {
  const plays: Play[] = [
    { step: "crawler", why: "Buyers ask AI assistants for recommendations; this checks they can read your site." },
    { step: "competitors", why: "Who buyers compare you with, from independent comparisons." },
  ];
  const b2b = fit.sellsTo.includes("businesses");
  const local = fit.sellsTo.includes("local businesses") && Boolean(fit.place.city) && maps !== null;
  if (b2b || local) plays.push({ step: "campaigns", why: "Who to target, from your own site and your competitors' customers." });
  if (b2b) plays.push({ step: "companies", why: "Companies that buy what you sell, each with the reason it was found." });
  if (local) plays.push({ step: "local", why: `${fit.localTypes.length ? fit.localTypes.slice(0, 2).join(" and ") : "Local businesses"} in ${fit.place.city} that may need you, from ${maps!.label}.` });
  plays.push({ step: "social", why: fit.sellsTo.includes("consumers") && !b2b ? "Your buyers ask in public before they buy; these are the open questions." : "People on Reddit, X and LinkedIn asking for what you sell." });
  if (b2b) plays.push({ step: "contacts", why: "The people to write to at those companies, with their public profiles." });
  if (b2b || local) plays.push({ step: "pitch", why: "First messages written from each one's own words." });
  return plays;
}
