// Search across the whole workspace: leads, CRM companies, contacts and
// deals, prospecting finds and buyer questions. Pure so it can be tested; the
// route loads the records and the palette shows the hits.

import type { AppId } from "./apps.ts";

export type RecordKind = "Lead" | "Company" | "Contact" | "Deal" | "Prospect" | "Decision maker" | "Question";

export interface SearchRecord {
  id: string;
  kind: RecordKind;
  title: string;
  subtitle: string;
  app: AppId;
  // Extra text that matches but is not shown (emails, domains, notes).
  terms?: string;
}

export interface SearchHit extends SearchRecord {
  score: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

// Every word of the query must appear; a title that starts with the query
// ranks first, then a title word that starts with it, then any match.
export function searchRecords(query: string, records: SearchRecord[], limit = 20): SearchHit[] {
  const q = norm(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const record of records) {
    const title = norm(record.title);
    const haystack = `${title} ${norm(record.subtitle)} ${norm(record.terms ?? "")}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    let score = 1;
    if (title.startsWith(q)) score = 4;
    else if (title.split(/[\s.@-]+/).some((part) => part.startsWith(words[0]))) score = 3;
    else if (title.includes(q)) score = 2;
    hits.push({ ...record, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

export interface SearchSources {
  leads?: Array<{ id: string; name: string; email: string; company: string; domain: string; title?: string; stage: string }>;
  companies?: Array<{ id: string; name: string; domain: string; industry: string; status: string }>;
  contacts?: Array<{ id: string; name: string; email: string; title: string }>;
  deals?: Array<{ id: string; name: string; stage: string; value: number; currency: string }>;
  prospects?: Array<{ domain: string; name: string; description?: string | null }>;
  people?: Array<{ name: string; title?: string | null; companyDomain: string }>;
  questions?: Array<{ id: string; text: string }>;
}

export function recordsFrom(sources: SearchSources): SearchRecord[] {
  const out: SearchRecord[] = [];
  for (const l of sources.leads ?? []) {
    out.push({ id: l.id, kind: "Lead", title: l.name || l.company, subtitle: [l.name ? l.company : l.domain, l.title, l.stage.replace(/_/g, " ")].filter(Boolean).join(" · "), app: "outreach", terms: `${l.email} ${l.domain} ${l.company}` });
  }
  for (const c of sources.companies ?? []) {
    out.push({ id: c.id, kind: "Company", title: c.name, subtitle: [c.domain, c.industry, c.status].filter(Boolean).join(" · "), app: "crm" });
  }
  for (const c of sources.contacts ?? []) {
    out.push({ id: c.id, kind: "Contact", title: c.name, subtitle: [c.title, c.email].filter(Boolean).join(" · "), app: "crm", terms: c.email });
  }
  for (const d of sources.deals ?? []) {
    out.push({ id: d.id, kind: "Deal", title: d.name, subtitle: `${d.stage} · ${d.value.toLocaleString()} ${d.currency}`, app: "crm" });
  }
  for (const p of sources.prospects ?? []) {
    out.push({ id: `prospect:${p.domain}`, kind: "Prospect", title: p.name, subtitle: [p.domain, p.description].filter(Boolean).join(" · ").slice(0, 120), app: "prospect", terms: p.domain });
  }
  for (const p of sources.people ?? []) {
    out.push({ id: `person:${p.companyDomain}:${p.name}`, kind: "Decision maker", title: p.name, subtitle: [p.title, p.companyDomain].filter(Boolean).join(" · "), app: "prospect" });
  }
  for (const q of sources.questions ?? []) {
    out.push({ id: q.id, kind: "Question", title: q.text, subtitle: "Buyer question tracked in AI answers", app: "queries" });
  }
  return out;
}
