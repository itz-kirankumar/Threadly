import { readData, writeData, patchData } from "@/lib/portal-db";
import { RequestError } from "@/lib/api-request";
import { randomUUID } from "node:crypto";
import type {
  Company, CompanyStatus, CrmContact, Deal, DealStage,
  WorkspaceActivity, WorkspaceActivityType, CrmAccountsState, CrmLead,
} from "./types";

// Relationship CRM store: companies, contacts, deals and next-step
// activities under the workspace crm/ tree. Record creation and updates are
// workspace-local; no external CRM sync runs from this surface.

const ROOT = "crm";

function toArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean) as T[];
  if (typeof value === "object") return Object.values(value as Record<string, T>).filter(Boolean);
  return [];
}

function safeId(id: string): string {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new RequestError("Invalid record id.", 400);
  return id;
}

function now(): string {
  return new Date().toISOString();
}

export async function loadCompanies(): Promise<Company[]> {
  const list = toArray<Company>(await readData(`${ROOT}/companies`));
  return list.filter(item => item && item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadContacts(): Promise<CrmContact[]> {
  const list = toArray<CrmContact>(await readData(`${ROOT}/contacts`));
  return list.filter(item => item && item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadDeals(): Promise<Deal[]> {
  const list = toArray<Deal>(await readData(`${ROOT}/deals`));
  return list.filter(item => item && item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadWorkspaceActivities(): Promise<WorkspaceActivity[]> {
  const list = toArray<WorkspaceActivity>(await readData(`${ROOT}/workspaceActivities`));
  return list.filter(item => item && item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadCrmAccountsState(): Promise<CrmAccountsState> {
  const [companies, contacts, deals, activities] = await Promise.all([
    loadCompanies(), loadContacts(), loadDeals(), loadWorkspaceActivities(),
  ]);
  return { companies, contacts, deals, activities };
}

export async function saveCompany(input: {
  id?: string; name: string; domain?: string; industry?: string;
  status?: CompanyStatus; owner: string; source?: string;
}): Promise<Company> {
  if (!input.name.trim()) throw new RequestError("Company name is required.", 400);
  const timestamp = now();
  const id = input.id ? safeId(input.id) : `co-${randomUUID().slice(0, 8)}`;
  const existing = input.id ? await readData<Company>(`${ROOT}/companies/${id}`) : null;
  const company: Company = {
    id,
    name: input.name.trim(),
    domain: input.domain !== undefined ? input.domain.trim() : existing?.domain || "",
    industry: input.industry !== undefined ? input.industry.trim() : existing?.industry || "",
    status: input.status || existing?.status || "prospect",
    owner: input.owner || existing?.owner || "",
    source: input.source?.trim() || existing?.source || "manual",
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  await writeData(`${ROOT}/companies/${id}`, company);
  return company;
}

export async function saveContact(input: {
  id?: string; companyId?: string; leadId?: string; name: string;
  email?: string; title?: string; owner: string;
}): Promise<CrmContact> {
  if (!input.name.trim()) throw new RequestError("Contact name is required.", 400);
  const email = input.email?.trim().toLowerCase() || "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("Enter a valid contact email address.", 400);
  const id = input.id ? safeId(input.id) : `ct-${randomUUID().slice(0, 8)}`;
  const existing = input.id ? await readData<CrmContact>(`${ROOT}/contacts/${id}`) : null;
  const timestamp = now();
  const contact: CrmContact = {
    id,
    companyId: input.companyId || existing?.companyId || null,
    leadId: input.leadId || existing?.leadId || null,
    name: input.name.trim(),
    email: input.email !== undefined ? email : existing?.email || "",
    title: input.title !== undefined ? input.title.trim() : existing?.title || "",
    status: existing?.status || "active",
    owner: input.owner || existing?.owner || "",
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  await writeData(`${ROOT}/contacts/${id}`, contact);
  return contact;
}

const STAGE_PROBABILITY: Record<DealStage, number> = {
  qualification: 20, discovery: 35, proposal: 55, negotiation: 75, won: 100, lost: 0,
};

export const DEAL_STAGES: DealStage[] = ["qualification", "discovery", "proposal", "negotiation", "won", "lost"];

export async function saveDeal(input: {
  id?: string; companyId?: string; contactId?: string; name: string;
  value?: number; currency?: string; stage?: DealStage; probability?: number;
  expectedClose?: string; owner: string;
}): Promise<Deal> {
  if (!input.name.trim()) throw new RequestError("Deal name is required.", 400);
  const value = typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0 ? input.value : undefined;
  const probability = typeof input.probability === "number" ? Math.min(100, Math.max(0, input.probability)) : undefined;
  if (input.stage !== undefined && !DEAL_STAGES.includes(input.stage)) throw new RequestError("Unknown deal stage.", 400);
  const id = input.id ? safeId(input.id) : `dl-${randomUUID().slice(0, 8)}`;
  const existing = input.id ? await readData<Deal>(`${ROOT}/deals/${id}`) : null;
  const timestamp = now();
  const deal: Deal = {
    id,
    companyId: input.companyId || existing?.companyId || null,
    contactId: input.contactId || existing?.contactId || null,
    name: input.name.trim(),
    value: value ?? existing?.value ?? 0,
    currency: input.currency?.trim().toUpperCase() || existing?.currency || "USD",
    stage: input.stage || existing?.stage || "qualification",
    probability: probability ?? existing?.probability ?? 20,
    expectedClose: input.expectedClose || existing?.expectedClose || null,
    owner: input.owner || existing?.owner || "",
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  await writeData(`${ROOT}/deals/${id}`, deal);
  return deal;
}

export async function updateDealStage(id: string, stage: DealStage): Promise<void> {
  if (!DEAL_STAGES.includes(stage)) throw new RequestError("Unknown deal stage.", 400);
  const deal = await readData<Deal>(`${ROOT}/deals/${safeId(id)}`);
  if (!deal) throw new RequestError("Deal not found.", 404);
  await patchData(`${ROOT}/deals/${safeId(id)}`, { stage, probability: STAGE_PROBABILITY[stage], updatedAt: now() });
}

export async function saveWorkspaceActivity(input: {
  type: WorkspaceActivityType; subject: string; body?: string;
  companyId?: string; contactId?: string; dealId?: string; dueAt?: string; owner: string;
}): Promise<WorkspaceActivity> {
  if (!input.subject.trim()) throw new RequestError("Activity subject is required.", 400);
  if (input.dueAt && Number.isNaN(Date.parse(input.dueAt))) throw new RequestError("Choose a valid activity date.", 400);
  const activity: WorkspaceActivity = {
    id: `wa-${randomUUID().slice(0, 8)}`,
    type: input.type,
    subject: input.subject.trim(),
    body: input.body?.trim() || "",
    companyId: input.companyId || null,
    contactId: input.contactId || null,
    dealId: input.dealId || null,
    dueAt: input.dueAt || null,
    completedAt: null,
    owner: input.owner,
    createdAt: now(),
  };
  await writeData(`${ROOT}/workspaceActivities/${activity.id}`, activity);
  return activity;
}

// Lead handoff: saving a lead creates or updates the matching account and
// contact without duplicating existing records (company by case-insensitive
// name, contact by email).
export async function syncLeadToAccounts(lead: CrmLead, owner: string): Promise<void> {
  const companyName = (lead.company || "").trim();
  let companyId: string | null = null;
  if (companyName) {
    const companies = toArray<Company>(await readData(`${ROOT}/companies`));
    const existing = companies.find(item => item && item.name && item.name.toLowerCase() === companyName.toLowerCase());
    const timestamp = now();
    if (existing) {
      companyId = existing.id;
      await patchData(`${ROOT}/companies/${existing.id}`, { updatedAt: timestamp });
    } else {
      const company = await saveCompany({
        name: companyName,
        domain: lead.domain || "",
        status: "prospect",
        owner,
        source: lead.source || "lead",
      });
      companyId = company.id;
    }
  }
  if (lead.email || lead.name) {
    const contacts = toArray<CrmContact>(await readData(`${ROOT}/contacts`));
    const existing = lead.email ? contacts.find(item => item && item.email === lead.email) : undefined;
    const timestamp = now();
    if (existing) {
      await patchData(`${ROOT}/contacts/${existing.id}`, { companyId, leadId: lead.id, updatedAt: timestamp });
    } else {
      await saveContact({
        companyId: companyId || undefined,
        leadId: lead.id,
        name: lead.name,
        email: lead.email || "",
        title: lead.title || "",
        owner,
      });
    }
  }
}
