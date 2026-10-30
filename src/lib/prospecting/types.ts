// Prospecting pipeline: research -> competitors -> campaigns -> companies ->
// decision makers -> email drafts. Every record carries the evidence it was
// built from (URL, query, fetch time) so the UI can show where each fact came
// from. Nothing in this pipeline sends email or contacts anyone.

export type StepId = "research" | "competitors" | "campaigns" | "companies" | "contacts" | "emails";

export const STEP_ORDER: StepId[] = ["research", "competitors", "campaigns", "companies", "contacts", "emails"];

export const STEP_LABELS: Record<StepId, string> = {
  research: "Research your company",
  competitors: "Explore competitors",
  campaigns: "Define campaigns",
  companies: "Find potential customers",
  contacts: "Find decision makers",
  emails: "Write emails",
};

export interface Evidence {
  kind: "page" | "search" | "profile" | "provider" | "user";
  url?: string;
  query?: string;
  quote?: string;
  at: string;
}

export interface PageSnapshot {
  url: string;
  finalUrl: string;
  domain: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  headings: string[];
  paragraphs: string[];
  links: string[];
  fetchedAt: string;
}

export interface Research {
  name: string;
  domain: string;
  summary: string;
  summarySource: "homepage" | "model" | "profile";
  keywords: string[];
  audiencePhrases: string[];
  page: PageSnapshot | null;
  pageError: string | null;
  evidence: Evidence[];
  ranAt: string;
}

export interface Competitor {
  domain: string;
  name: string;
  description: string | null;
  tracked: boolean;
  selected: boolean;
  appearances: number;
  evidence: Evidence[];
}

export interface CompetitorsStep {
  items: Competitor[];
  // Audiences the competitors name on their own homepages, most common first.
  audiences?: Array<{ phrase: string; count: number; quote: string; url: string }>;
  queries: string[];
  searchAvailable: boolean;
  ranAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  searchQuery: string;
  roles: string[];
  source: "homepage" | "model" | "user";
  evidence: Evidence[];
  selected: boolean;
}

export interface CampaignsStep {
  items: Campaign[];
  ranAt: string;
}

export interface ProspectCompany {
  domain: string;
  name: string;
  description: string | null;
  campaignId: string;
  matchedTerms: string[];
  selected: boolean;
  evidence: Evidence[];
}

export interface CompaniesStep {
  items: ProspectCompany[];
  queries: string[];
  skipped: { domain: string; reason: string }[];
  ranAt: string;
}

export interface ProspectContact {
  id: string;
  companyDomain: string;
  name: string;
  firstName: string | null;
  title: string | null;
  email: string | null;
  // Provider-reported confidence (0-100) and verification state, verbatim.
  confidence: number | null;
  verification: string | null;
  linkedinUrl: string | null;
  source: string;
  evidence: Evidence[];
}

export interface ContactsStep {
  status: "found" | "provider_not_configured" | "no_results";
  provider: string | null;
  items: ProspectContact[];
  searchedDomains: number;
  ranAt: string;
}

export interface EmailDraft {
  id: string;
  companyDomain: string;
  contactId: string | null;
  to: string | null;
  subject: string;
  body: string;
  engine: "template" | "model";
  sources: Evidence[];
  missing: string[];
  updatedAt: string;
}

export interface EmailsStep {
  items: EmailDraft[];
  ranAt: string;
}

export interface ProspectingState {
  version: 1;
  research?: Research;
  competitors?: CompetitorsStep;
  campaigns?: CampaignsStep;
  companies?: CompaniesStep;
  contacts?: ContactsStep;
  emails?: EmailsStep;
  // The log of the most recent run of each step, so the activity rail can be
  // replayed after a reload.
  logs?: Partial<Record<StepId, string[]>>;
  updatedAt: string;
}

export type StepEvent =
  | { type: "log"; step: StepId; text: string; at: string }
  | { type: "done"; step: StepId; state: ProspectingState; credits?: { charged: number; balance: number } }
  | { type: "error"; step: StepId; message: string };
