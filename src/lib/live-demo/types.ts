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
  // What the site says it is, e.g. "AI workspace"; null when it does not say.
  category?: string | null;
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
  facts: { founded: string | null; location: string | null; employees: string | null };
}
export interface DemoCompany {
  domain: string;
  name: string;
  description: string | null;
  iconDataUrl?: string | null;
  matchedTerms?: string[];
  // Competitors: how many independent pages named it.
  sources?: number;
  // Potential customers: why it is one ("Customer of Coda").
  signal?: string | null;
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
  // The competitors and category words the post mentions.
  matched?: string[];
  reply: string | null;
  postedAt: string | null;
  // For undated posts, the search window that found them ("month" means
  // posted in the last 30 days).
  window?: "month" | "year" | null;
}
export interface DemoSocial {
  topic: string;
  leads: DemoSocialLead[];
}
export interface DemoPerson {
  company: string;
  domain: string;
  name: string;
  title: string;
  // The company's own page the person was read from.
  source: string | null;
}
export interface DemoContacts {
  roles: string[];
  companies: Array<{ name: string; domain: string }>;
  people: DemoPerson[];
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
