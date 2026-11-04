// Decision makers a company names on its own website. A team or leadership
// page lists people as a name followed by a title ("Jane Doe" then "Chief
// Revenue Officer", or "Jane Doe, CEO" on one line); only those pairs are
// read, with the page they came from. Nothing else about a person is
// collected: no profile is scraped and no email address is guessed.

import { decodeEntities } from "./text.ts";
import { fetchHtml } from "./web.ts";

export interface PublicPerson {
  name: string;
  title: string;
  // Their public LinkedIn profile, from a search result; null when none was
  // found or the match was not certain.
  profileUrl?: string | null;
  // "team page" when the company names them on its own site, "public
  // search" when they come only from a profile search result.
  via?: "team page" | "public search";
  // Their picture: the headshot on the company's own page, else the avatar
  // of their public X profile.
  photoUrl?: string | null;
  // Their public X profile, when its bio names the company.
  xUrl?: string | null;
}

export interface CompanyPeople {
  domain: string;
  company: string;
  people: PublicPerson[];
  // The page the people were read from; null when none could be read.
  source: string | null;
}

const TITLE_WORDS = /\b(chief\s+[a-z]+(\s+officer)?|ceo|cto|cfo|coo|cmo|cro|cpo|ciso|cio|founder|co-?founder|president|vice\s+president|vp|svp|evp|head\s+of|director|managing\s+director|general\s+manager|partner|owner|principal|chair(man|woman|person)?)\b/i;
// Lines that look like names but are headings, buttons or company words.
const NOT_NAME = /\b(team|teams|leadership|board|about|contact|careers|join|our|the|meet|read|more|view|profile|company|inc|llc|ltd|gmbh|group|services|solutions|products|privacy|terms|cookies?|news|blog|press|investors?|customers?|partners?|offices?|locations?|management|executive|advisors?|directors|values|mission|history|learn|follow|linkedin|twitter|email|watch|download|sign|log|book|get|started|pricing|platform|features?)\b/i;
// Words in job titles and departments: "Delivery Lead" is a role, not a name.
const ROLE_WORD = /\b(chief|officer|lead|leader|director|manager|head|founder|co-?founder|president|partner|owner|principal|chair\w*|vp|ceo|cto|cfo|coo|cmo|cro|product|revenue|sales|marketing|operations|engineering|customer|success|growth|delivery|finance|people|design|strategy|business|development|technology|data|security|legal|general|counsel|board|interim|senior|junior|associate|executive|managing|global|regional)\b/i;
const NAME = /^\p{Lu}[\p{Ll}'’-]+(?:\s+(?:\p{Lu}\.|\p{Lu}[\p{Ll}'’-]+|de|van|von|da|di|del|der|la|le|bin|al))*\s+\p{Lu}[\p{Ll}'’-]+$/u;

function isName(s: string): boolean {
  const t = s.trim();
  return t.length >= 5 && t.length <= 40 && t.split(/\s+/).length <= 4 && NAME.test(t) && !NOT_NAME.test(t) && !ROLE_WORD.test(t);
}

function isTitle(s: string): boolean {
  const t = s.trim();
  // "EA to the President" names the president's assistant.
  if (/^(ea|pa|assistant|executive assistant|personal assistant)\b|\bassistant to\b/i.test(t)) return false;
  // A title is a short phrase ("Co-founder & CEO", "VP of Sales"), not a
  // sentence that happens to contain "partner" or "director".
  if (/^[:\-–—|·,]/.test(t) || /\b(is|are|was|our|we|proud|the best|of the)\b/i.test(t) || t.split(/\s+/).length > 8) return false;
  return t.length >= 2 && t.length <= 80 && TITLE_WORDS.test(t) && !/[.!?]\s+\S/.test(t) && !isName(t);
}

// The page's text, one block (heading, paragraph, list item, cell) per line.
export function htmlLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|td|th|tr|section|article|figure|figcaption|span|a|strong|b|em|dt|dd|header|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// A title that ends in another organisation ("Design Director, Code and
// Theory") belongs to a customer quote, not to this company's team.
function ownTitle(title: string, company: string): boolean {
  const tail = title.split(/,| at /).slice(1).join(" ").trim();
  if (!tail) return true;
  if (TITLE_WORDS.test(tail) || /^(and|&)\b/i.test(tail)) return true;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(company) && (squash(tail).includes(squash(company)) || squash(company).includes(squash(tail)));
}

export function extractPeople(html: string, limit = 12, company = ""): PublicPerson[] {
  const lines = htmlLines(html);
  const out: PublicPerson[] = [];
  const seen = new Set<string>();
  const push = (name: string, title: string) => {
    const key = name.toLowerCase();
    if (seen.has(key) || !ownTitle(title, company)) return;
    seen.add(key);
    out.push({ name: name.trim(), title: title.trim().replace(/[\s,;|·–—-]+$/, "") });
  };
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const line = lines[i];
    // "Jane Doe, CEO" / "Jane Doe – Co-founder & CEO" / "Jane Doe | CTO"
    const one = line.match(/^(.{4,40}?)\s*(?:,|–|—|\s-\s|\||·)\s*(.{2,80})$/);
    if (one && isName(one[1]) && isTitle(one[2])) {
      push(one[1], one[2]);
      continue;
    }
    if (!isName(line)) continue;
    for (const next of lines.slice(i + 1, i + 3)) {
      if (isTitle(next)) {
        push(line, next);
        break;
      }
    }
  }
  return out;
}

// The headshot a team page shows for a person: an image whose alt text is
// their name, as https, from the company's own page.
export function photoFor(html: string, name: string, base: string): string | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const alt = (tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!alt || !(alt === key || (alt.includes(key) && alt.length - key.length <= 24))) continue;
    const raw = tag.match(/\b(?:data-src|src)\s*=\s*["']([^"']+)["']/i)?.[1] ?? tag.match(/\bsrcset\s*=\s*["']([^\s"',]+)/i)?.[1];
    if (!raw || raw.startsWith("data:")) continue;
    try {
      const url = new URL(decodeEntities(raw), base);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // not a usable address
    }
  }
  return null;
}

// People whose titles match the campaign's roles first ("Head of Sales" for
// a sales tool), then founders and the C-suite.
export function rankForRoles(people: PublicPerson[], roles: string[]): PublicPerson[] {
  const wanted = new Set(roles.join(" ").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !["head", "chief", "officer", "vice", "president"].includes(w)));
  const score = (p: PublicPerson) => {
    const t = p.title.toLowerCase();
    let s = 0;
    for (const w of wanted) if (t.includes(w)) s += 2;
    if (/\b(ceo|founder|co-?founder|chief executive|president|owner|managing director)\b/.test(t)) s += 1.5;
    else if (/\b(chief|c[a-z]o|vp|vice president|head of)\b/.test(t)) s += 1;
    return s;
  };
  return [...people].sort((a, b) => score(b) - score(a));
}

// Reads a company's team page (linked from its homepage, else /about and
// /team) and returns the decision makers it names.
export async function findDecisionMakers(company: { domain: string; name: string; peopleUrl?: string }, roles: string[], max = 3): Promise<CompanyPeople> {
  const candidates = [...new Set([company.peopleUrl, `https://${company.domain}/about`, `https://${company.domain}/team`].filter((u): u is string => Boolean(u)))];
  for (const url of candidates.slice(0, 3)) {
    try {
      const { html, finalUrl } = await fetchHtml(url, 6000);
      // A redirect to the homepage is not a team page; names there are
      // usually customer quotes.
      if (/^\/?$/.test(new URL(finalUrl).pathname)) continue;
      const people = extractPeople(html, 12, company.name);
      if (people.length) {
        const ranked = rankForRoles(people, roles).slice(0, max).map((p) => ({ ...p, photoUrl: photoFor(html, p.name, finalUrl) }));
        return { domain: company.domain, company: company.name, people: ranked, source: finalUrl };
      }
    } catch {
      // not readable; try the next page
    }
  }
  return { domain: company.domain, company: company.name, people: [], source: null };
}

// ---- Public profile links ------------------------------------------------------
// A public LinkedIn profile as a search engine indexes it: "Jane Doe - VP
// Sales at Acme | LinkedIn", with "Headline:" in the snippet. Only the search
// result is read; nothing is fetched from LinkedIn.

// Words of a name, hyphenated parts included ("El-Hefnawy"), and initials.
const PERSON = /^(?:\p{Lu}\.?|\p{Lu}[\p{Ll}'’]+(?:-\p{L}[\p{Ll}'’]*)*)(?:\s+(?:\p{Lu}\.?|\p{Lu}[\p{Ll}'’]+(?:-\p{L}[\p{Ll}'’]*)*|de|van|von|da|di|del|der|la|le|bin|al))*\s+\p{Lu}[\p{Ll}'’]+(?:-\p{L}[\p{Ll}'’]*)*$/u;

export interface ProfileResult {
  name: string;
  headline: string;
  url: string;
  // The country subdomain the profile was indexed under (au, in, uk), if any.
  country: string | null;
}

const invisible = (s: string) => s.replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();

export function profileFromResult(hit: { title: string; url: string; content: string }): ProfileResult | null {
  let u: URL;
  try {
    u = new URL(hit.url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)linkedin\.com$/.test(host) || !/^\/in\/[^/]+\/?$/.test(u.pathname)) return null;
  const title = invisible(hit.title).replace(/\s*[|·–—-]\s*LinkedIn\s*$/i, "");
  const [name, ...rest] = title.split(/\s+[-–—|]\s+/);
  if (!name || name.length > 40 || !PERSON.test(name.trim()) || NOT_NAME.test(name)) return null;
  const fromSnippet = invisible(hit.content).match(/Headline:\s*(.+?)(?=\s+(?:Current role|Seniority|Location|Experience|Education|Company|About):|$)/i)?.[1];
  const headline = invisible(fromSnippet ?? rest.join(" - ")).slice(0, 160);
  const country = host.match(/^([a-z]{2})\.linkedin\.com$/)?.[1] ?? null;
  return { name: name.trim(), headline, url: `https://www.linkedin.com${u.pathname.replace(/\/$/, "")}`, country };
}

const squashWords = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

// Whether a profile is at this company: its headline names the company
// (or its domain), the person is not merely named like the company ("Allan
// Taylor" at Allan Taylor & Co), and a country-coded domain (.com.au) agrees
// with the profile's country.
export function profileMatchesCompany(p: ProfileResult, company: { name: string; domain: string }): boolean {
  const head = ` ${squashWords(p.headline)} `;
  const name = squashWords(company.name.replace(/\b(inc|ltd|llc|gmbh|co|corp|plc|limited)\b\.?/gi, ""));
  const label = company.domain.split(".")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  // Whole words only: "Engine" is not "AdEngineStrategies".
  const named = (name.length >= 3 && head.includes(` ${name} `)) || (label.length >= 3 && head.includes(` ${label} `));
  if (!named) return false;
  if (squashWords(p.name).includes(name) || name.includes(squashWords(p.name))) return false;
  const tld = company.domain.split(".").pop() ?? "";
  const cc = tld === "uk" ? "uk" : tld.length === 2 && !["io", "ai", "co", "me", "so", "tv", "gg", "ly"].includes(tld) ? tld : null;
  return !cc || !p.country || p.country === cc;
}

// The role a profile states, if it is a decision maker's.
export function profileTitle(p: ProfileResult): string | null {
  // The first clause of a headline: "Head of Product @ Docfield ➤ Driving..."
  // is "Head of Product".
  const head = p.headline.split(/\s+[|➤•·]\s*|\s+-\s+|\s+@\s+|\s+at\s+/i)[0].trim();
  return TITLE_WORDS.test(head) ? head.replace(/[,;:]\s*$/, "").slice(0, 80) : null;
}

type Search = (q: string, max: number, options: { includeDomains: string[] }) => Promise<Array<{ title: string; url: string; content: string }>>;

const X_RESERVED = new Set(["home", "search", "explore", "i", "intent", "share", "hashtag", "login", "signup", "settings", "messages", "notifications"]);

// A person's public X profile from a search result: "Marie (@MarieMartens) /
// X", kept only when the name matches and the bio or page names the company
// or its domain. Its avatar is their public profile picture.
export function xProfileFromResult(hit: { title: string; url: string; content: string }, person: string, company: { name: string; domain: string }): { handle: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(hit.url);
  } catch {
    return null;
  }
  if (!/(^|\.)(x|twitter)\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length !== 1 || X_RESERVED.has(parts[0].toLowerCase()) || !/^[A-Za-z0-9_]{1,15}$/.test(parts[0])) return null;
  const m = invisible(hit.title).match(/^(.+?)\s*\(@([A-Za-z0-9_]{1,15})\)/);
  if (!m || m[2].toLowerCase() !== parts[0].toLowerCase()) return null;
  const words = squashWords(person).split(" ");
  const shown = squashWords(m[1]);
  const handle = m[2].toLowerCase();
  const sameName = shown === squashWords(person) || (words.length >= 2 && shown.includes(words[0]) && (shown.includes(words[words.length - 1]) || handle.includes(words[words.length - 1])));
  const firstOnly = words.length >= 2 && shown === words[0] && (handle.includes(words[0]) || handle.includes(words[words.length - 1]));
  if (!sameName && !firstOnly) return null;
  const text = ` ${squashWords(`${hit.content}`)} `;
  const label = company.domain.split(".")[0].toLowerCase();
  const named = hit.content.toLowerCase().includes(company.domain) || text.includes(` ${squashWords(company.name)} `) || (label.length >= 4 && text.includes(` ${label}`));
  return named ? { handle: m[2], url: `https://x.com/${m[2]}` } : null;
}

// Apollo's people search, used only as a fallback when the company's own
// pages and public profiles name nobody. Needs APOLLO_API_KEY; names, titles,
// LinkedIn links and photos only, never emails.
export async function apolloPeople(domain: string, roles: string[], max = 3): Promise<PublicPerson[]> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return [];
  const body = JSON.stringify({ q_organization_domains_list: [domain], person_titles: roles.length ? roles : ["founder", "ceo"], page: 1, per_page: max });
  for (const path of ["mixed_people/search", "mixed_people/api_search"]) {
    try {
      const res = await fetch(`https://api.apollo.io/api/v1/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key }, body, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { people?: Array<{ name?: string; first_name?: string; last_name?: string; title?: string; linkedin_url?: string; photo_url?: string }> };
      const people = (data.people ?? [])
        .map((p) => ({ name: (p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ")).trim(), title: (p.title ?? "").trim(), profileUrl: p.linkedin_url ?? null, photoUrl: p.photo_url && /^https:/.test(p.photo_url) ? p.photo_url : null, via: "public search" as const }))
        .filter((p) => PERSON.test(p.name) && p.title);
      if (people.length) return people.slice(0, max);
    } catch {
      // try the next endpoint
    }
  }
  return [];
}

// Real pictures and a second channel: each person's public X profile when a
// search finds one that names the company. LinkedIn photos are not fetched.
export async function withXProfiles(team: CompanyPeople, search: Search, max = 2): Promise<CompanyPeople> {
  const people = await Promise.all(team.people.map(async (person, i) => {
    if (i >= max || person.xUrl) return person;
    const hits = await search(`"${person.name}" ${team.company}`, 6, { includeDomains: ["x.com", "twitter.com"] }).catch(() => []);
    const x = hits.map((h) => xProfileFromResult(h, person.name, { name: team.company, domain: team.domain })).find(Boolean);
    return x ? { ...person, xUrl: x.url, photoUrl: person.photoUrl ?? `https://unavatar.io/x/${x.handle}?fallback=false` } : person;
  }));
  return { ...team, people };
}

// Adds public profile links: each person a team page named is looked up by
// name and company; a company with no team page is searched by role. Only
// profiles whose headline names the company are kept.
export async function withProfiles(team: CompanyPeople, roles: string[], search: Search): Promise<CompanyPeople> {
  const company = { name: team.company, domain: team.domain };
  if (team.people.length) {
    const people = await Promise.all(team.people.slice(0, 3).map(async (person, i) => {
      if (i > 1) return { ...person, via: "team page" as const };
      const hits = await search(`"${person.name}" ${team.company}`, 5, { includeDomains: ["linkedin.com"] }).catch(() => []);
      const match = hits.map(profileFromResult).find((p) => p && squashWords(p.name) === squashWords(person.name) && profileMatchesCompany(p, company));
      return { ...person, via: "team page" as const, profileUrl: match?.url ?? null };
    }));
    return { ...team, people };
  }
  const hits = await search(`${team.company} ${roles[0] ?? "founder"} founder`, 10, { includeDomains: ["linkedin.com"] }).catch(() => []);
  const found: PublicPerson[] = [];
  for (const p of hits.map(profileFromResult)) {
    if (!p || !profileMatchesCompany(p, company) || found.some((f) => squashWords(f.name) === squashWords(p.name))) continue;
    const title = profileTitle(p);
    if (title) found.push({ name: p.name, title, profileUrl: p.url, via: "public search" });
  }
  return { ...team, people: rankForRoles(found, roles).slice(0, 3) };
}
