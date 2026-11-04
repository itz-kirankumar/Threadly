// Shared by the landing-page live demo route and its client.

// Every step a run can take. Each run takes only the steps its plan picks
// for the business (a "plan" event), in this order.
export const DEMO_STEPS = ["research", "crawler", "competitors", "campaigns", "companies", "local", "social", "contacts", "pitch"] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];

export const DEMO_STEP_LABELS: Record<DemoStep, string> = {
  research: "Read your business",
  crawler: "AI readiness audit",
  competitors: "Map competitors",
  campaigns: "Choose who to target",
  companies: "Find potential customers",
  local: "Local businesses to serve",
  social: "People asking online",
  contacts: "Decision makers",
  pitch: "Write first messages",
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
  fit?: DemoFit;
}
// Whether Threadly serves this business (small digital businesses only),
// what it is, who it sells to, and the evidence behind each conclusion.
export interface DemoFit {
  inSegment: boolean;
  kind: string;
  sellsTo: string[];
  localTypes: string[];
  team: { count: number; label: string; source: string; url: string | null } | null;
  size: "small" | "mid-sized" | "large" | "unknown";
  place: { city: string | null; country: string | null };
  reason: string;
  facts: Array<{ label: string; value: string; source: string; url: string | null }>;
  sources: number;
}
export interface DemoPlan {
  steps: DemoStep[];
  plays: Array<{ step: DemoStep; why: string }>;
}
export interface DemoLocalBusiness {
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  source: "Google Maps" | "OpenStreetMap";
  needs: string[];
  sequence?: { dm: string; followUps: Array<{ day: number; body: string }> } | null;
}
export interface DemoLocal {
  provider: string;
  city: string;
  types: string[];
  businesses: DemoLocalBusiness[];
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
  // The author's display name and public profile link, when the post shows them.
  authorName?: string | null;
  profileUrl?: string | null;
  // Drafted direct message and follow-ups; drafts only, nothing is sent.
  sequence?: { dm: string; followUps: Array<{ day: number; body: string }> } | null;
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
  // Their public profile, from a search result whose headline names the company.
  profileUrl?: string | null;
  via?: "team page" | "public search";
  // Their picture: the company's own headshot, else their X avatar.
  photoUrl?: string | null;
  // Their public X profile, when its bio names the company.
  xUrl?: string | null;
  // Drafted first message and follow-ups; nothing is sent.
  sequence?: { dm: string; followUps: Array<{ day: number; body: string }> } | null;
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
  local?: DemoLocal;
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
  | { type: "plan"; data: DemoPlan }
  // Public sources read so far: searches, results and pages.
  | { type: "stats"; data: { searches: number; sources: number } }
  | { type: "error"; step: DemoStep | null; message: string }
  | { type: "end" };
