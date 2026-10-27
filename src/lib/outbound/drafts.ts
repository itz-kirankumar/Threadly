// Draft generation: deterministic template rendering only. No LLM call, no
// provider send. Every {{variable}} in a template must be in the campaign's
// allowedPersonalization list AND have a value in the supplied evidence map;
// anything else fails closed and the intent keeps its drafted status.

import type { CampaignVersion, Contact, MessageIntent } from "./types.ts";

export interface Draft {
  tenantId: string;
  draftId: string;
  intentId: string;
  step: number;
  subject: string;
  body: string;
  engine: "template" | "mock-llm" | "http-llm" | "template-fallback";
  // Set when llm-assisted was requested but the approved template was used
  // instead; records exactly why (F06 fallback is explicit, never silent).
  fallbackReason?: string;
  renderedAt: string;
  createdAt: string;
  createdBy: string;
}

export interface DraftStore {
  saveDraft(d: Draft): Promise<void>;
  getDraftForIntent(tenantId: string, intentId: string): Promise<Draft | null>;
  listDrafts(tenantId: string, campaignId?: string): Promise<Draft[]>;
}

export class MemoryDraftStore implements DraftStore {
  drafts = new Map<string, Draft>();

  async saveDraft(d: Draft): Promise<void> {
    this.drafts.set(`${d.tenantId}:${d.intentId}`, d);
  }
  async getDraftForIntent(tenantId: string, intentId: string): Promise<Draft | null> {
    return this.drafts.get(`${tenantId}:${intentId}`) ?? null;
  }
  async listDrafts(tenantId: string): Promise<Draft[]> {
    return [...this.drafts.values()].filter((d) => d.tenantId === tenantId);
  }
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function templateVariables(text: string): string[] {
  return [...text.matchAll(VAR_RE)].map((m) => m[1]);
}

export interface RenderResult {
  ok: boolean;
  subject?: string;
  body?: string;
  reasons: string[];
}

export function renderTemplate(
  campaign: CampaignVersion,
  intent: MessageIntent,
  evidence: Record<string, string>
): RenderResult {
  const template = (Array.isArray(campaign.templates) ? campaign.templates : []).find((t) => t.step === intent.step);
  if (!template) return { ok: false, reasons: [`no_template_for_step:${intent.step}`] };
  const allowed = new Set(Array.isArray(campaign.allowedPersonalization) ? campaign.allowedPersonalization : []);
  const reasons: string[] = [];
  const vars = new Set([...templateVariables(template.subject), ...templateVariables(template.body)]);
  for (const v of vars) {
    if (!allowed.has(v)) reasons.push(`variable_not_allowed:${v}`);
    else if (typeof evidence[v] !== "string" || !evidence[v]) reasons.push(`evidence_missing:${v}`);
  }
  if (reasons.length) return { ok: false, reasons };
  const fill = (text: string) => text.replace(VAR_RE, (_, name: string) => evidence[name]);
  return { ok: true, subject: fill(template.subject), body: fill(template.body), reasons: [] };
}

// Evidence for the pilot: verified contact facts only, keyed by the variable
// names campaigns may allow. Nothing is inferred.
export function contactEvidence(contact: Contact): Record<string, string> {
  const ev: Record<string, string> = {};
  if (contact.fullName) ev.first_name = contact.fullName.split(" ")[0];
  if (contact.fullName) ev.full_name = contact.fullName;
  if (contact.title) ev.title = contact.title;
  if (contact.email) ev.email = contact.email;
  return ev;
}
