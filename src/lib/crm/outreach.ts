import { loadBrand } from "@/lib/geo/store";
import { appendLeadActivity, loadLead, loadOutreachTemplates, saveLead } from "./store";
import type { CrmLead, OutreachTemplate, LeadStage } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function sender(): string {
  return process.env.EMAIL_FROM || "Threadly GEO <outreach@gothreadly.live>";
}

function firstName(fullName: string): string {
  const n = (fullName || "").trim().split(/\s+/)[0];
  return n || "there";
}

export function renderTemplate(
  templateStr: string,
  variables: Record<string, string | number | undefined>
): string {
  let result = templateStr;
  for (const [key, val] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    result = result.replace(regex, String(val ?? ""));
  }
  return result;
}

export async function prepareOutreachEmail(
  lead: CrmLead,
  stepNumber: number,
  customTemplate?: Partial<OutreachTemplate>
): Promise<{ subject: string; body: string; step: OutreachTemplate }> {
  const templates = await loadOutreachTemplates();
  const template =
    templates.find((t) => t.step === stepNumber) ||
    templates[0] || {
      step: stepNumber,
      name: `Step ${stepNumber}`,
      subject: "AI visibility gap for {{company}}",
      body: "Hi {{firstName}},\n\nWanted to share an AI citation report for {{company}}.",
      delayDays: 3,
    };

  const brand = await loadBrand();
  const competitor =
    lead.geoGap?.competitorsCited?.[0] ||
    brand?.competitors?.[0]?.name ||
    "Competitors";

  const vars: Record<string, string | number | undefined> = {
    firstName: firstName(lead.name),
    fullName: lead.name,
    company: lead.company,
    domain: lead.domain,
    title: lead.title || "Leader",
    competitorName: competitor,
    queryText: lead.geoGap?.queryText || "top enterprise solutions",
    category: brand?.category || "software & services",
    geoScore: lead.score || 45,
    citationShare: lead.geoGap?.citationShare ? `${lead.geoGap.citationShare}%` : "0%",
  };

  const subject = renderTemplate(customTemplate?.subject || template.subject, vars);
  const body = renderTemplate(customTemplate?.body || template.body, vars);

  return { subject, body, step: template };
}

export async function dispatchOutreachStep(
  leadId: string,
  targetStep?: number,
  customEmail?: { subject?: string; body?: string }
): Promise<{ success: boolean; lead: CrmLead; message: string }> {
  const lead = await loadLead(leadId);
  if (!lead) throw new Error("Lead not found.");

  // Production sending guard, owner-approved 27 Oct 2026 (WhatsApp, quoted "ok").
  // Live dispatch stays disabled until outreach is rebuilt with suppression,
  // unsubscribe, evidence-backed content and a send ledger. No state changes,
  // no activity log, no provider call, no simulated send.
  if (process.env.OUTREACH_SEND_ENABLED !== "true") {
    return {
      success: false,
      lead,
      message:
        "Outreach sending is disabled. This production guard was owner-approved on 27 Oct 2026 and stays until the outreach flow is rebuilt with suppression, unsubscribe, evidence-backed content and a send ledger.",
    };
  }

  const stepNumber = targetStep ?? (lead.sequenceStep + 1);
  const { subject, body, step } = await prepareOutreachEmail(lead, stepNumber, customEmail);

  let emailSent = false;
  let deliveryDetail = "Logged in CRM sequence";

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && lead.email && lead.email.includes("@") && !lead.email.includes("example.com")) {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: sender(),
          to: [lead.email],
          subject,
          text: body,
        }),
      });
      if (res.ok) {
        emailSent = true;
        deliveryDetail = "Delivered via Resend";
      } else {
        const errText = await res.text();
        deliveryDetail = `Resend response ${res.status}: ${errText.slice(0, 100)}`;
      }
    } catch (e) {
      deliveryDetail = `Send error: ${e instanceof Error ? e.message : "Network error"}`;
    }
  } else {
    // In dev, test, or demo mode without live API key, simulate sending
    emailSent = true;
    deliveryDetail = "Simulated delivery (demo/test mode)";
  }

  const now = new Date();
  const nextDelayDays = step.delayDays > 0 ? step.delayDays : 3;
  const nextDate = new Date(now.getTime() + nextDelayDays * 24 * 60 * 60 * 1000);

  const isFinalStep = stepNumber >= 4;
  const nextStage: LeadStage = isFinalStep ? "contacted" : "in_sequence";

  lead.sequenceStep = stepNumber;
  lead.stage = nextStage;
  lead.lastContactedAt = now.toISOString();
  lead.nextFollowUpAt = isFinalStep ? null : nextDate.toISOString();
  lead.updatedAt = now.toISOString();

  await saveLead(lead);

  await appendLeadActivity({
    leadId: lead.id,
    type: "email_sent",
    title: `Sent Step ${stepNumber}: ${step.name}`,
    detail: `Subject: "${subject}" — ${deliveryDetail}`,
    actor: "Auto-Outreach Engine",
    metadata: { step: stepNumber, subject, body, deliveryDetail },
  });

  return {
    success: true,
    lead,
    message: `Step ${stepNumber} dispatched to ${lead.name} (${lead.email}). Next touchpoint scheduled for ${nextDate.toLocaleDateString()}.`,
  };
}

export async function runBatchAutoFollowUps(): Promise<{
  processed: number;
  results: Array<{ leadId: string; name: string; step: number; status: string }>;
}> {
  const { loadLeads } = await import("./store");
  const leads = await loadLeads();
  const now = new Date().toISOString();

  const dueLeads = leads.filter(
    (l) =>
      (l.stage === "in_sequence" || l.stage === "follow_up_due") &&
      l.nextFollowUpAt &&
      l.nextFollowUpAt <= now &&
      l.sequenceStep < 4
  );

  const results: Array<{ leadId: string; name: string; step: number; status: string }> = [];

  for (const lead of dueLeads) {
    try {
      const nextStep = lead.sequenceStep + 1;
      const res = await dispatchOutreachStep(lead.id, nextStep);
      results.push({
        leadId: lead.id,
        name: lead.name,
        step: nextStep,
        status: res.message,
      });
    } catch (err) {
      results.push({
        leadId: lead.id,
        name: lead.name,
        step: lead.sequenceStep + 1,
        status: `Error: ${err instanceof Error ? err.message : "Failed"}`,
      });
    }
  }

  return { processed: results.length, results };
}

export async function recordLeadReply(
  leadId: string,
  replyText: string,
  sentiment: "interested" | "question" | "not_interested" | "booked" = "interested"
): Promise<{ lead: CrmLead; suggestedReply: string }> {
  const lead = await loadLead(leadId);
  if (!lead) throw new Error("Lead not found.");

  let newStage: LeadStage = "replied";
  let suggestedReply = "";

  if (sentiment === "interested" || sentiment === "booked") {
    newStage = "qualified";
    suggestedReply = `Hi ${firstName(lead.name)},\n\nGlad this resonated! I've attached your full GEO citation audit comparing ${lead.company} against top AI queries. Here is a direct link to pick a 15-minute slot that works for you: https://cal.com/threadly/geo-review\n\nLooking forward to speaking!`;
  } else if (sentiment === "question") {
    newStage = "replied";
    suggestedReply = `Hi ${firstName(lead.name)},\n\nGreat question. Generative Engine Optimization specifically tunes how LLMs (like ChatGPT, Perplexity, and Claude) summarize sources when answering buying queries. Unlike traditional SEO, it focuses on factual citation density and brand anchor presence in LLM training and retrieval pipelines.\n\nHappy to walk through a live example for ${lead.company}.`;
  } else {
    newStage = "lost";
    suggestedReply = `Hi ${firstName(lead.name)},\n\nUnderstood completely! Thanks for letting me know. I'll make sure not to reach out again. Best of luck with ${lead.company}!`;
  }

  lead.stage = newStage;
  lead.nextFollowUpAt = null; // stop automated cadence
  lead.updatedAt = new Date().toISOString();
  await saveLead(lead);

  await appendLeadActivity({
    leadId: lead.id,
    type: "reply_received",
    title: `Prospect Replied (${sentiment.toUpperCase()})`,
    detail: replyText.slice(0, 300),
    actor: lead.name,
    metadata: { sentiment, replyText, suggestedReply },
  });

  return { lead, suggestedReply };
}
