// Every lead a demo run found, in one prioritised list: people publicly
// asking, decision makers at potential customers, and the companies
// themselves. Each gets three plain scores, 0 to 100, from facts in the run:
//   fit     how well they match what the company sells (a competitor named,
//           a competitor's customer, the category's own words)
//   intent  how ready they look to buy (asking for an alternative or a
//           recommendation, how recent; using a competitor today)
//   reach   whether there is a direct way to them (a public profile link)
// and a score that weighs intent highest. Nothing here is a prediction:
// every number comes from what the run read, and "why" lists it.

import type { DemoCompany, DemoPerson, DemoResults, DemoSocialLead } from "./types";

export type LeadKind = "Person asking" | "Decision maker" | "Company";
export type Priority = "Hot" | "Warm" | "Cold";

export interface ScoredLead {
  id: string;
  kind: LeadKind;
  name: string;
  company: string | null;
  // The person's title, or what they asked.
  detail: string;
  // Where the lead was found: Reddit, X, LinkedIn, team page, public profile.
  source: string;
  platform: DemoSocialLead["platform"] | null;
  profileUrl: string | null;
  sourceUrl: string | null;
  photoUrl: string | null;
  fit: number;
  intent: number;
  reach: number;
  score: number;
  priority: Priority;
  why: string[];
  reply: string | null;
  sequence: { dm: string; followUps: Array<{ day: number; body: string }> } | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function priorityOf(score: number): Priority {
  return score >= 75 ? "Hot" : score >= 55 ? "Warm" : "Cold";
}

function combine(fit: number, intent: number, reach: number): number {
  return clamp(0.4 * fit + 0.45 * intent + 0.15 * reach);
}

const DAY = 86_400_000;

export function scoreAsk(lead: DemoSocialLead, competitors: string[], now = Date.now()): ScoredLead {
  const matched = lead.matched ?? [];
  const rivals = matched.filter((m) => competitors.some((c) => c.toLowerCase() === m.toLowerCase()));
  const terms = matched.filter((m) => !rivals.includes(m));
  const why: string[] = [];
  let fit = 40;
  if (rivals.length) {
    fit = 75 + Math.min(20, (rivals.length - 1) * 10);
    why.push(`names ${rivals.slice(0, 2).join(" and ")}`);
  } else if (terms.length) {
    fit = 55 + Math.min(15, (terms.length - 1) * 5);
    why.push(`asks about ${terms.slice(0, 2).join(", ")}`);
  }
  let intent = { "looking for an alternative": 85, "asking for a recommendation": 75, "asking for help": 50 }[lead.intent] ?? 25;
  why.push(lead.intent);
  const age = lead.postedAt ? (now - Date.parse(lead.postedAt)) / DAY : lead.window === "month" ? 15 : lead.window === "year" ? 200 : null;
  if (age !== null && age <= 30) {
    intent += 10;
    why.push("posted this month");
  } else if (age !== null && age > 180) intent -= 10;
  const reach = lead.profileUrl ? 80 : 50;
  if (lead.profileUrl) why.push("direct profile link");
  const score = combine(fit, intent, reach);
  return {
    id: `ask:${lead.url}`,
    kind: "Person asking",
    name: lead.authorName ?? lead.author ?? (lead.platform === "Reddit" ? `Poster in ${lead.community ?? "Reddit"}` : `${lead.platform} author`),
    company: null,
    detail: lead.title,
    source: lead.platform,
    platform: lead.platform,
    profileUrl: lead.profileUrl ?? null,
    sourceUrl: lead.url,
    photoUrl: null,
    fit: clamp(fit),
    intent: clamp(intent),
    reach,
    score,
    priority: priorityOf(score),
    why,
    reply: lead.reply,
    sequence: lead.sequence ?? null,
  };
}

// A potential customer's own fit and intent: a competitor's customer already
// pays for the category (strong fit, a switch to win); a campaign match fits
// the audience but shows no buying yet.
function companySignal(company: DemoCompany): { fit: number; intent: number; why: string[] } {
  const signal = company.signal ?? "";
  const terms = company.matchedTerms ?? [];
  if (/^Customer of /.test(signal)) return { fit: 80 + Math.min(10, terms.length * 5), intent: 45, why: [signal.replace(/^Customer of/, "uses"), "a switch to win"] };
  return { fit: 55 + Math.min(10, terms.length * 5), intent: 25, why: [signal || "matches the campaign", ...(terms.length ? [`homepage says ${terms.slice(0, 2).join(", ")}`] : [])] };
}

export function scorePerson(person: DemoPerson, company: DemoCompany | undefined, roles: string[]): ScoredLead {
  const base = company ? companySignal(company) : { fit: 55, intent: 25, why: [] as string[] };
  const words = roles.join(" ").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !["head", "chief", "officer", "vice", "president"].includes(w));
  const rightRole = words.some((w) => person.title.toLowerCase().includes(w)) || /\b(ceo|founder|co-?founder|owner|managing director|president)\b/i.test(person.title);
  const intent = base.intent + (rightRole ? 10 : 0);
  const reach = person.profileUrl ? 85 : person.source ? 60 : 40;
  const why = [...base.why, ...(rightRole ? [`the right role: ${person.title}`] : []), person.profileUrl ? "direct profile link" : person.source ? "named on their team page" : ""].filter(Boolean);
  const score = combine(base.fit, intent, reach);
  return {
    id: `person:${person.domain}:${person.name}`,
    kind: "Decision maker",
    name: person.name,
    company: person.company,
    detail: person.title,
    source: person.via === "public search" ? "Public profile" : "Team page",
    platform: null,
    profileUrl: person.profileUrl ?? null,
    sourceUrl: person.source ?? person.profileUrl ?? null,
    photoUrl: person.photoUrl ?? null,
    fit: clamp(base.fit),
    intent: clamp(intent),
    reach,
    score,
    priority: priorityOf(score),
    why,
    reply: null,
    sequence: person.sequence ?? null,
  };
}

export function scoreCompany(company: DemoCompany): ScoredLead {
  const { fit, intent, why } = companySignal(company);
  const reach = 30;
  const score = combine(fit, intent, reach);
  return {
    id: `company:${company.domain}`,
    kind: "Company",
    name: company.name,
    company: company.name,
    detail: company.description ?? company.domain,
    source: "Company website",
    platform: null,
    profileUrl: null,
    sourceUrl: `https://${company.domain}/`,
    photoUrl: company.iconDataUrl ?? null,
    fit: clamp(fit),
    intent: clamp(intent),
    reach,
    score,
    priority: priorityOf(score),
    why: [...why, "no decision maker found yet"],
    reply: null,
    sequence: null,
  };
}

// All leads in the run, best first. A company appears as its decision makers
// when any were found, and as itself otherwise, so nothing is counted twice.
export function buildLeads(results: DemoResults, now = Date.now()): ScoredLead[] {
  const competitors = (results.competitors ?? []).map((c) => c.name);
  const companies = results.companies ?? [];
  const people = results.contacts?.people ?? [];
  const roles = results.contacts?.roles ?? [];
  const withPeople = new Set(people.map((p) => p.domain));
  const leads = [
    ...(results.social?.leads ?? []).filter((l) => l.intent !== "discussing the topic").map((l) => scoreAsk(l, competitors, now)),
    ...people.map((p) => scorePerson(p, companies.find((c) => c.domain === p.domain), roles)),
    ...companies.filter((c) => !withPeople.has(c.domain)).map(scoreCompany),
  ];
  return leads.sort((a, b) => b.score - a.score || b.intent - a.intent || a.name.localeCompare(b.name));
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The lead list as CSV, for sharing or importing into a CRM.
export function leadsCsv(leads: ScoredLead[]): string {
  const head = ["priority", "score", "fit", "intent", "reach", "type", "name", "company", "title_or_post", "source", "profile_url", "source_url", "why"];
  const rows = leads.map((l) => [l.priority, l.score, l.fit, l.intent, l.reach, l.kind, l.name, l.company, l.detail, l.source, l.profileUrl, l.sourceUrl, l.why.join("; ")].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}
