import { loadBrand } from "@/lib/geo/store";
import { appendLeadActivity, loadLead, loadOutreachTemplates, saveLead } from "./store";
import type { CrmLead, OutreachTemplate, LeadStage } from "./types";

// Leads are the discovery entry point. Drafts composed here are for review and
// copying only: every real send runs through the outbound engine
// (src/lib/outbound), which is the single policy gate for suppression,
// unsubscribe, verification, sender consent, caps and the send ledger. This
// module never calls an email provider.
export const LEAD_SENDING_DISABLED_MESSAGE =
  "Leads do not send email. Approve a campaign in Outbound to contact this lead: sending there checks suppression, unsubscribe, verification and caps, and records every send.";

export const REPLY_SENTIMENTS = ["interested", "question", "not_interested", "booked"] as const;
export type ReplySentiment = (typeof REPLY_SENTIMENTS)[number];

export function isReplySentiment(value: unknown): value is ReplySentiment {
  return typeof value === "string" && (REPLY_SENTIMENTS as readonly string[]).includes(value);
}

function firstName(fullName: string): string | undefined {
  const n = (fullName || "").trim().split(/\s+/)[0];
  return n || undefined;
}

// Replaces {{key}} for every key with a known value. A variable without a
// value is left in place so the draft visibly shows what is missing; nothing
// is filled with a guessed or default fact.
export function renderTemplate(
  templateStr: string,
  variables: Record<string, string | number | undefined>
): string {
  return templateStr.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (match, key: string) => {
    const val = variables[key];
    return val === undefined || val === "" ? match : String(val);
  });
}

export function unresolvedVariables(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g)) names.add(m[1]);
  return [...names];
}

export async function prepareOutreachEmail(
  lead: CrmLead,
  stepNumber: number,
  customTemplate?: Partial<OutreachTemplate>
): Promise<{ subject: string; body: string; step: OutreachTemplate; missingVariables: string[] }> {
  const templates = await loadOutreachTemplates();
  const template = templates.find((t) => t.step === stepNumber) || templates[0];

  const brand = await loadBrand();
  // Only values recorded on the lead or the workspace brand are used.
  const vars: Record<string, string | number | undefined> = {
    firstName: firstName(lead.name),
    fullName: lead.name || undefined,
    company: lead.company || undefined,
    domain: lead.domain || undefined,
    title: lead.title || undefined,
    competitorName: lead.geoGap?.competitorsCited?.[0],
    queryText: lead.geoGap?.queryText,
    category: brand?.category || undefined,
    senderCompany: brand?.name || undefined,
  };

  const subject = renderTemplate(customTemplate?.subject || template.subject, vars);
  const body = renderTemplate(customTemplate?.body || template.body, vars);

  return { subject, body, step: template, missingVariables: unresolvedVariables(`${subject}\n${body}`) };
}

// Records a reply the user received outside Threadly. The reply text is the
// user's own record; nothing is generated or sent in response.
export async function recordLeadReply(
  leadId: string,
  replyText: string,
  sentiment: ReplySentiment,
  actor: string
): Promise<{ lead: CrmLead }> {
  const lead = await loadLead(leadId);
  if (!lead) throw new Error("Lead not found.");

  const nextStage: LeadStage =
    sentiment === "not_interested" ? "lost" : sentiment === "question" ? "replied" : "qualified";

  lead.stage = nextStage;
  lead.nextFollowUpAt = null; // a reply always stops the cadence
  lead.updatedAt = new Date().toISOString();
  await saveLead(lead);

  await appendLeadActivity({
    leadId: lead.id,
    type: "reply_received",
    title: `Reply recorded: ${SENTIMENT_LABELS[sentiment]}`,
    detail: replyText.slice(0, 300),
    actor,
    metadata: { sentiment, replyText: replyText.slice(0, 5000) },
  });

  return { lead };
}

export const SENTIMENT_LABELS: Record<ReplySentiment, string> = {
  interested: "Interested",
  question: "Question",
  not_interested: "Not interested",
  booked: "Meeting booked",
};
