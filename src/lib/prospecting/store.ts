import { readData, writeData } from "../portal-db.ts";
import type { ProspectingState } from "./types.ts";

const PATH = "prospecting/state";

function arr<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined) as T[];
  if (value && typeof value === "object") return Object.values(value as Record<string, T>).filter((v) => v !== null && v !== undefined);
  return [];
}

// The Realtime Database drops empty arrays and turns sparse ones into
// objects, so every list is normalized on read.
export function normalizeState(raw: unknown): ProspectingState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const state: ProspectingState = { version: 1, updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : new Date(0).toISOString() };
  if (s.research) {
    state.research = {
      ...s.research,
      keywords: arr<string>(s.research.keywords),
      audiencePhrases: arr<string>(s.research.audiencePhrases),
      evidence: arr(s.research.evidence),
      page: s.research.page ? { ...s.research.page, headings: arr<string>(s.research.page.headings), paragraphs: arr<string>(s.research.page.paragraphs), links: arr<string>(s.research.page.links) } : null,
      pageError: s.research.pageError ?? null,
    };
  }
  if (s.competitors) state.competitors = { ...s.competitors, queries: arr(s.competitors.queries), items: arr<any>(s.competitors.items).map((c) => ({ ...c, description: c.description ?? null, evidence: arr(c.evidence) })) };
  if (s.campaigns) state.campaigns = { ...s.campaigns, items: arr<any>(s.campaigns.items).map((c) => ({ ...c, roles: arr(c.roles), evidence: arr(c.evidence) })) };
  if (s.companies) state.companies = { ...s.companies, queries: arr(s.companies.queries), skipped: arr(s.companies.skipped), items: arr<any>(s.companies.items).map((c) => ({ ...c, description: c.description ?? null, matchedTerms: arr(c.matchedTerms), evidence: arr(c.evidence) })) };
  if (s.contacts) state.contacts = { ...s.contacts, provider: s.contacts.provider ?? null, items: arr<any>(s.contacts.items).map((c) => ({ ...c, firstName: c.firstName ?? null, title: c.title ?? null, email: c.email ?? null, confidence: c.confidence ?? null, verification: c.verification ?? null, linkedinUrl: c.linkedinUrl ?? null, evidence: arr(c.evidence) })) };
  if (s.emails) state.emails = { ...s.emails, items: arr<any>(s.emails.items).map((d) => ({ ...d, to: d.to ?? null, contactId: d.contactId ?? null, sources: arr(d.sources), missing: arr(d.missing) })) };
  if (s.logs && typeof s.logs === "object") {
    state.logs = Object.fromEntries(Object.entries(s.logs).map(([k, v]) => [k, arr<string>(v)]));
  }
  return state;
}

export async function loadState(): Promise<ProspectingState> {
  return normalizeState(await readData(PATH));
}

export async function saveState(state: ProspectingState): Promise<void> {
  // JSON round trip drops undefined fields, which the Admin SDK rejects.
  await writeData(PATH, JSON.parse(JSON.stringify({ ...state, updatedAt: new Date().toISOString() })));
}

export async function resetState(): Promise<void> {
  await writeData(PATH, null);
}
