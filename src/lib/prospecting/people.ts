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
      if (people.length) return { domain: company.domain, company: company.name, people: rankForRoles(people, roles).slice(0, max), source: finalUrl };
    } catch {
      // not readable; try the next page
    }
  }
  return { domain: company.domain, company: company.name, people: [], source: null };
}
