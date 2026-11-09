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

import { clampScore as clamp, combineScore as combine, companyFitIntent, priorityOf, rightRole, type Priority } from "../leads/score.ts";
import type { DemoCompany, DemoLocalBusiness, DemoPerson, DemoResults, DemoSocialLead } from "./types";

export { priorityOf, type Priority };
export type LeadKind = "Person asking" | "Decision maker" | "Company" | "Local business";

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
  // BANT, after the ai-sales-team qualification checklists: each part met
  // or not, with the evidence from the run.
  bant: Bant;
  reply: string | null;
  sequence: { dm: string; followUps: Array<{ day: number; body: string; stage?: string }> } | null;
}

export interface Bant {
  budget: { met: boolean; why: string };
  authority: { met: boolean; why: string };
  need: { met: boolean; why: string };
  timing: { met: boolean; why: string };
}

const part = (met: boolean, yes: string, no: string) => ({ met, why: met ? yes : no });

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
  const bant: Bant = {
    budget: part(rivals.length > 0, `already weighing ${rivals[0]}`, "no paid tool named"),
    authority: part(/\b(i|we|my|our)\b/i.test(lead.title), "asking for their own use", "role not stated"),
    need: part(lead.intent !== "discussing the topic", lead.intent, "discussing, not asking"),
    timing: part(age !== null && age <= 30, "posted this month", "not this month"),
  };
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
    bant,
    reply: lead.reply,
    sequence: lead.sequence ?? null,
  };
}

function companySignal(company: DemoCompany): { fit: number; intent: number; why: string[] } {
  return companyFitIntent(company.signal, company.matchedTerms ?? []);
}

export function scorePerson(person: DemoPerson, company: DemoCompany | undefined, roles: string[]): ScoredLead {
  const base = company ? companySignal(company) : { fit: 55, intent: 25, why: [] as string[] };
  const right = rightRole(person.title, roles);
  const intent = base.intent + (right ? 10 : 0);
  const reach = person.profileUrl ? 85 : person.source ? 60 : 40;
  const why = [...base.why, ...(right ? [`the right role: ${person.title}`] : []), person.profileUrl ? "direct profile link" : person.source ? "named on their team page" : ""].filter(Boolean);
  const score = combine(base.fit, intent, reach);
  const signal = company?.signal ?? "";
  const bant: Bant = {
    budget: part(/^(Customer of|Hiring a)/.test(signal), signal, "spend not shown"),
    authority: part(right, person.title, "not a deciding role"),
    need: part(Boolean(signal), signal || "", "no signal"),
    timing: part(/^Hiring a/.test(signal), "hiring now", "no timing signal"),
  };
  if (person.likelyEmail) why.push("likely email (not verified)");
  return {
    id: `person:${person.domain}:${person.name}`,
    kind: "Decision maker",
    name: person.name,
    company: person.company,
    detail: person.title,
    source: person.via === "public search" ? "Public profile" : "Team page",
    platform: null,
    profileUrl: person.profileUrl ?? person.xUrl ?? null,
    sourceUrl: person.source ?? person.profileUrl ?? person.xUrl ?? null,
    photoUrl: person.photoUrl ?? null,
    fit: clamp(base.fit),
    intent: clamp(intent),
    reach,
    score,
    priority: priorityOf(score),
    why,
    bant,
    reply: null,
    sequence: person.sequence ?? null,
  };
}

export function scoreCompany(company: DemoCompany): ScoredLead {
  const { fit, intent, why } = companySignal(company);
  const email = company.emails?.[0] ?? null;
  const reach = email ? 70 : 30;
  const score = combine(fit, intent, reach);
  const signal = company.signal ?? "";
  const bant: Bant = {
    budget: part(/^(Customer of|Hiring a)/.test(signal), signal, "spend not shown"),
    authority: part(false, "", "no decision maker yet"),
    need: part(Boolean(signal), signal, "no signal"),
    timing: part(/^Hiring a/.test(signal), "hiring now", "no timing signal"),
  };
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
    why: [...why, email ? `published address ${email}` : "no decision maker found yet"],
    bant,
    reply: null,
    sequence: null,
  };
}

// A local business from the map: fit from what its listing lacks that the
// visitor sells, reach from a phone or website on the listing.
export function scoreLocal(b: DemoLocalBusiness): ScoredLead {
  const gaps = b.needs.filter((n) => !/^Listed on/.test(n));
  const fit = 50 + Math.min(40, gaps.length * 20);
  const intent = 30 + (gaps.length ? 15 : 0);
  const reach = b.phone ? 75 : b.website ? 60 : 35;
  const score = combine(fit, intent, reach);
  return {
    id: `local:${b.name}:${b.address ?? ""}`,
    kind: "Local business",
    name: b.name,
    company: b.name,
    detail: [b.category, b.address].filter(Boolean).join(" · "),
    source: b.source,
    platform: null,
    profileUrl: b.mapsUrl,
    sourceUrl: b.website ?? b.mapsUrl,
    photoUrl: null,
    fit,
    intent,
    reach,
    score,
    priority: priorityOf(score),
    why: [...gaps, ...(b.phone ? ["phone on the listing"] : [])],
    bant: {
      budget: part(b.reviews !== null && b.reviews >= 50, "busy enough to invest", "size not shown"),
      authority: part(Boolean(b.people?.length), b.people?.[0] ? `${b.people[0].name}, ${b.people[0].title}` : "", "owner not named"),
      need: part(gaps.length > 0, gaps[0] ?? "", "no gap on the listing"),
      timing: part(false, "", "no timing signal"),
    },
    reply: null,
    sequence: b.sequence ?? null,
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
    ...(results.local?.businesses ?? []).map(scoreLocal),
  ];
  return leads.sort((a, b) => b.score - a.score || b.intent - a.intent || a.name.localeCompare(b.name));
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The lead list as CSV, for sharing or importing into a CRM.
export function leadsCsv(leads: ScoredLead[]): string {
  const head = ["priority", "score", "fit", "intent", "reach", "type", "name", "company", "title_or_post", "source", "profile_url", "source_url", "bant", "why"];
  const bantText = (b: Bant) => (["budget", "authority", "need", "timing"] as const).filter((k) => b[k].met).join("+") || "none";
  const rows = leads.map((l) => [l.priority, l.score, l.fit, l.intent, l.reach, l.kind, l.name, l.company, l.detail, l.source, l.profileUrl, l.sourceUrl, bantText(l.bant), l.why.join("; ")].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}
