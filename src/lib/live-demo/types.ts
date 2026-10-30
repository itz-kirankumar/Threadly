// Shared by the landing-page live demo route and its client.

export const DEMO_STEPS = ["research", "competitors", "campaigns", "companies", "signals", "contacts", "pitch"] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];

export const DEMO_STEP_LABELS: Record<DemoStep, string> = {
  research: "Research your company",
  competitors: "Map competitors",
  campaigns: "Define a campaign",
  companies: "Find potential customers",
  signals: "Read public conversations",
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
export interface DemoCompany {
  domain: string;
  name: string;
  description: string | null;
  matchedTerms?: string[];
}
export interface DemoCampaign {
  name: string;
  description: string;
  searchQuery: string;
  roles: string[];
  selected: boolean;
}
export interface DemoSignals {
  topic: string;
  posts: Array<{ platform: string; title: string; url: string; snippet: string }>;
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
}

export interface DemoResults {
  research?: DemoResearch;
  competitors?: DemoCompany[];
  campaigns?: DemoCampaign[];
  companies?: DemoCompany[];
  signals?: DemoSignals;
  contacts?: DemoContacts;
  pitch?: DemoDraft[];
}

export type DemoEvent =
  | { type: "step"; step: DemoStep }
  | { type: "log"; step: DemoStep; text: string }
  | { type: "result"; step: DemoStep; data: unknown }
  | { type: "error"; step: DemoStep | null; message: string }
  | { type: "end" };
