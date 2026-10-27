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

export const DEFAULT_TEMPLATES: OutreachTemplate[] = [
  {
    step: 1,
    name: "Initial GEO Gap Notice",
    subject: "Quick question on {{company}}'s AI search visibility",
    body: `Hi {{firstName}},

Noticed {{company}} isn't being cited when buyers query generative AI engines (ChatGPT, Claude, Perplexity) for {{category}}.

Instead, {{competitorName}} is capturing the majority of AI citation share for queries like "{{queryText}}".

We put together an AI citation audit with 3 quick fixes to get {{company}} recommended by AI engines.

Open to a 5-minute preview?

Best,
The Threadly GEO Team`,
    delayDays: 0,
  },
  {
    step: 2,
    name: "Value-Add Crawler & llms.txt Audit",
    subject: "Re: Quick question on {{company}}'s AI search visibility",
    body: `Hi {{firstName}},

Following up with a specific finding from our scan of {{domain}}:

AI bots like GPTBot and PerplexityBot are currently missing structured knowledge about {{company}}'s core features and pricing. Adding a standard llms.txt and structured fact anchors would immediately help models cite you accurately.

Would you like me to send over the ready-to-deploy knowledge block?

Best,
Threadly Team`,
    delayDays: 3,
  },
  {
    step: 3,
    name: "Social Proof & Case Study",
    subject: "+240% citation share case study for {{company}}",
    body: `Hi {{firstName}},

Thought this might be timely: a B2B SaaS in {{category}} recently grew their AI model citation share by 240% in under 30 days after optimizing their citation anchor pool.

Given {{company}}'s brand authority, you are positioned to outrank {{competitorName}} on generative answers quickly.

Do you have 10 minutes this Thursday or Friday to review your custom gap map?

Best,
Threadly Team`,
    delayDays: 4,
  },
  {
    step: 4,
    name: "Gentle Breakup / Door Open",
    subject: "Closing the loop on {{company}} AI citations",
    body: `Hi {{firstName}},

I haven't heard back, so I assume optimizing {{company}}'s generative AI presence isn't a top priority right now.

I'll close your audit file for now. If you ever want to check your brand visibility score across ChatGPT, Claude, and Perplexity, feel free to run a scan at gothreadly.live.

Wishing you and {{company}} the best,
Threadly Team`,
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
