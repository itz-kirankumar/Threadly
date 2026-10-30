export type LeadStage =
  | "new"
  | "contacted"
  | "in_sequence"
  | "follow_up_due"
  | "replied"
  | "qualified"
  | "won"
  | "lost";

export type LeadSource =
  | "geo_gap_discovery"
  | "prospecting"
  | "crawler_audit"
  | "competitor_analysis"
  | "inbound"
  | "manual";

export interface GeoGapSummary {
  queryText?: string;
  competitorsCited?: string[];
  missingFromAi?: boolean;
  citationShare?: number;
  readinessScore?: number;
  identifiedGap?: string;
}

export interface CrmLead {
  id: string;
  name: string;
  email: string;
  company: string;
  domain: string;
  title?: string;
  phone?: string;
  stage: LeadStage;
  source: LeadSource;
  score: number; // 0 - 100
  dealValue?: number;
  notes?: string;
  tags?: string[];
  sequenceStep: number; // 0 = not started, 1 = initial sent, 2 = follow-up 1, etc.
  maxSequenceSteps?: number;
  nextFollowUpAt?: string | null;
  lastContactedAt?: string | null;
  geoGap?: GeoGapSummary;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType =
  | "note"
  | "email_sent"
  | "email_opened"
  | "reply_received"
  | "stage_change"
  | "audit_attached"
  | "follow_up_scheduled";

export interface CrmActivity {
  id: string;
  leadId: string;
  type: ActivityType;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface OutreachTemplate {
  step: number;
  name: string;
  subject: string;
  body: string;
  delayDays: number;
}

export interface CrmStats {
  totalLeads: number;
  activeInSequence: number;
  followUpsDue: number;
  repliedCount: number;
  wonCount: number;
  totalPipelineValue: number;
  averageScore: number;
}

// Relationship CRM objects (accounts, people, pipeline deals, next-step
// activities). Ported from the itz-kirankumar-integrate-crm-features branch
// onto the current workspace stack; storage lives under crm/ in the same
// workspace tree as leads.
export type CompanyStatus = "prospect" | "customer" | "inactive";

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  status: CompanyStatus;
  owner: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmContact {
  id: string;
  companyId: string | null;
  leadId: string | null;
  name: string;
  email: string;
  title: string;
  status: "active" | "inactive";
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export type DealStage = "qualification" | "discovery" | "proposal" | "negotiation" | "won" | "lost";

export interface Deal {
  id: string;
  companyId: string | null;
  contactId: string | null;
  name: string;
  value: number;
  currency: string;
  stage: DealStage;
  probability: number;
  expectedClose: string | null;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceActivityType = "note" | "task" | "meeting" | "email";

export interface WorkspaceActivity {
  id: string;
  type: WorkspaceActivityType;
  subject: string;
  body: string;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  owner: string;
  createdAt: string;
}

export interface CrmAccountsState {
  companies: Company[];
  contacts: CrmContact[];
  deals: Deal[];
  activities: WorkspaceActivity[];
}
