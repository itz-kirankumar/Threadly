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
