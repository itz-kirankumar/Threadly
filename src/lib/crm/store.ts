import { readData, writeData } from "@/lib/portal-db";
import { randomUUID } from "node:crypto";
import type { CrmLead, CrmActivity, OutreachTemplate, CrmStats, LeadStage } from "./types";

const CRM_ROOT = "crm";

function toArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean) as T[];
  if (typeof value === "object") return Object.values(value as Record<string, T>).filter(Boolean);
  return [];
}

export async function loadLeads(): Promise<CrmLead[]> {
  const raw = await readData(`${CRM_ROOT}/leads`);
  const leads = toArray<CrmLead>(raw);
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadLead(leadId: string): Promise<CrmLead | null> {
  const lead = await readData<CrmLead>(`${CRM_ROOT}/leads/${leadId}`);
  return lead ?? null;
}

export async function saveLead(lead: CrmLead): Promise<void> {
  await writeData(`${CRM_ROOT}/leads/${lead.id}`, lead);
}

export async function deleteLead(leadId: string): Promise<void> {
  await writeData(`${CRM_ROOT}/leads/${leadId}`, null);
  // Also clean up activities for this lead
  await writeData(`${CRM_ROOT}/activities/${leadId}`, null);
}

export async function appendLeadActivity(activity: Omit<CrmActivity, "id" | "timestamp"> & { id?: string; timestamp?: string }): Promise<CrmActivity> {
  const entry: CrmActivity = {
    id: activity.id || `act-${randomUUID()}`,
    timestamp: activity.timestamp || new Date().toISOString(),
    ...activity,
  };
  const raw = await readData(`${CRM_ROOT}/activities/${activity.leadId}`);
  const list = toArray<CrmActivity>(raw);
  list.push(entry);
  await writeData(`${CRM_ROOT}/activities/${activity.leadId}`, list.slice(-100));
  return entry;
}

export async function loadLeadActivities(leadId: string): Promise<CrmActivity[]> {
  const raw = await readData(`${CRM_ROOT}/activities/${leadId}`);
  const list = toArray<CrmActivity>(raw);
  return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Starter sequence for a new workspace. It deliberately contains no claims,
// statistics or case studies: bracketed text must be replaced with the
// workspace's own approved wording before a draft is usable.
export const DEFAULT_TEMPLATES: OutreachTemplate[] = [
  {
    step: 1,
    name: "Introduction",
    subject: "{{company}} and {{senderCompany}}",
    body: `Hi {{firstName}},

[One sentence on why you are writing to {{company}}, based on a fact you can cite.]

[One sentence on what {{senderCompany}} offers, using approved product claims only.]

[A single, specific question or request.]

[Your name]`,
    delayDays: 0,
  },
  {
    step: 2,
    name: "Follow-up",
    subject: "Following up: {{company}}",
    body: `Hi {{firstName}},

[A short follow-up that adds one new, cited piece of information.]

[Your name]`,
    delayDays: 3,
  },
  {
    step: 3,
    name: "Final follow-up",
    subject: "Closing the loop: {{company}}",
    body: `Hi {{firstName}},

[A brief close. State that you will not follow up again unless they reply.]

[Your name]`,
    delayDays: 4,
  },
];

export async function loadOutreachTemplates(): Promise<OutreachTemplate[]> {
  const raw = await readData(`${CRM_ROOT}/templates`);
  const list = toArray<OutreachTemplate>(raw);
  return list.length ? list.sort((a, b) => a.step - b.step) : DEFAULT_TEMPLATES;
}

export async function saveOutreachTemplates(templates: OutreachTemplate[]): Promise<void> {
  await writeData(`${CRM_ROOT}/templates`, templates);
}

export async function loadCrmStats(): Promise<CrmStats> {
  const leads = await loadLeads();
  const now = new Date().toISOString();

  let activeInSequence = 0;
  let followUpsDue = 0;
  let repliedCount = 0;
  let wonCount = 0;
  let totalPipelineValue = 0;
  let totalScore = 0;

  for (const lead of leads) {
    if (lead.stage === "in_sequence") activeInSequence++;
    if (lead.stage === "replied") repliedCount++;
    if (lead.stage === "won") wonCount++;
    if (lead.dealValue) totalPipelineValue += lead.dealValue;
    totalScore += lead.score || 0;

    const isDue =
      lead.stage === "follow_up_due" ||
      (lead.stage === "in_sequence" && lead.nextFollowUpAt && lead.nextFollowUpAt <= now);
    if (isDue) followUpsDue++;
  }

  return {
    totalLeads: leads.length,
    activeInSequence,
    followUpsDue,
    repliedCount,
    wonCount,
    totalPipelineValue,
    averageScore: leads.length ? Math.round(totalScore / leads.length) : 0,
  };
}
