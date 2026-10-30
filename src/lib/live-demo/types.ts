// Shared by the landing-page live demo route and its client.

export const DEMO_STEPS = ["research", "crawler", "competitors", "campaigns", "companies", "social", "contacts", "pitch"] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];

export const DEMO_STEP_LABELS: Record<DemoStep, string> = {
  research: "Research your company",
  crawler: "AI readiness audit",
  competitors: "Map competitors",
  campaigns: "Define a campaign",
  companies: "Find potential customers",
  social: "Reddit, X and LinkedIn leads",
  contacts: "Decision makers",
  pitch: "Write the first email",
};

export interface DemoResearch {
  name: string;
  domain: string;
  summary: string;
  keywords: string[];
  iconDataUrl: string | null;
  readHomepage: boolean;
}
// Can AI assistants read the site, and does the homepage say clearly what
// the business is? Weighted checks out of 100 (lib/geo/site-audit.ts); a
// readiness measure, not a prediction of citation.
export interface DemoCrawler {
  score: number;
  grade: "A" | "B" | "C" | "D";
  passed: number;
  total: number;
  categories: Array<{ name: string; score: number; max: number; checks: Array<{ label: string; passed: boolean; detail: string; weight: number }> }>;
  bots: Array<{ name: string; engine: string; status: "allowed" | "blocked" | "not_specified" }>;
  issues: string[];
}
export interface DemoCompany {
  domain: string;
  name: string;
  description: string | null;
  iconDataUrl?: string | null;
  matchedTerms?: string[];
}
export interface DemoCampaign {
  name: string;
  description: string;
  searchQuery: string;
  roles: string[];
  selected: boolean;
}
export interface DemoSocialLead {
  platform: "Reddit" | "X" | "LinkedIn";
  url: string;
  title: string;
  snippet: string;
  author: string | null;
  community: string | null;
  intent: string;
  reply: string | null;
}
export interface DemoSocial {
  topic: string;
  leads: DemoSocialLead[];
}
export interface DemoContacts {
  roles: string[];
  companies: string[];
}
export interface DemoDraft {
  company: string;
  domain: string;
  subject: string;
  body: string;
  sources: string[];
  engine: "model" | "composed";
}

export interface DemoResults {
  research?: DemoResearch;
  crawler?: DemoCrawler;
  competitors?: DemoCompany[];
  campaigns?: DemoCampaign[];
  companies?: DemoCompany[];
  social?: DemoSocial;
  contacts?: DemoContacts;
  pitch?: DemoDraft[];
}

export type DemoEvent =
  | { type: "step"; step: DemoStep }
  | { type: "log"; step: DemoStep; text: string }
  | { type: "result"; step: DemoStep; data: unknown }
  // One item found while the step is still running (a competitor, company
  // or social post), streamed so the visitor watches it arrive.
  | { type: "item"; step: DemoStep; data: unknown }
  | { type: "error"; step: DemoStep | null; message: string }
  | { type: "end" };
