// The Threadly suite: every app in the workspace, where it sits, what it does
// and which apps it feeds. One registry drives the app launcher, the side
// rail, breadcrumbs, search and the connected flow on Home, so an app is
// named and described the same way everywhere.

export type AppId =
  | "overview"
  | "prospect"
  | "outreach"
  | "crm"
  | "enterprise"
  | "queries"
  | "citations"
  | "optimizer"
  | "runs"
  | "social"
  | "settings";

export type AppGroup = "home" | "sales" | "visibility" | "admin";

export interface SuiteApp {
  id: AppId;
  name: string;
  group: AppGroup;
  description: string;
  // Tailwind classes for the app tile (launcher and page header).
  tile: string;
  // Apps this one hands its work to.
  feeds: AppId[];
}

export const GROUP_LABELS: Record<AppGroup, string> = {
  home: "Home",
  sales: "Sales",
  visibility: "AI visibility",
  admin: "Admin",
};

export const SUITE_APPS: SuiteApp[] = [
  { id: "overview", name: "Home", group: "home", description: "Your pipeline and AI visibility at a glance, with what to do next.", tile: "suite-tile-home", feeds: [] },
  { id: "prospect", name: "Prospecting", group: "sales", description: "Find competitors, customers and decision makers from your website.", tile: "suite-tile-prospect", feeds: ["outreach", "crm"] },
  { id: "outreach", name: "Leads", group: "sales", description: "Scored leads with follow-ups, drafts and replies.", tile: "suite-tile-leads", feeds: ["crm", "enterprise"] },
  { id: "crm", name: "CRM", group: "sales", description: "Companies, contacts, deals and tasks.", tile: "suite-tile-crm", feeds: ["enterprise"] },
  { id: "enterprise", name: "Outbound", group: "sales", description: "Campaigns, senders, approvals, replies and meetings.", tile: "suite-tile-outbound", feeds: ["crm"] },
  { id: "queries", name: "Questions", group: "visibility", description: "The questions your buyers ask ChatGPT, Claude and Gemini.", tile: "suite-tile-questions", feeds: ["runs"] },
  { id: "citations", name: "Citations", group: "visibility", description: "Which sites AI answers cite for your category.", tile: "suite-tile-citations", feeds: ["optimizer"] },
  { id: "optimizer", name: "Optimization", group: "visibility", description: "Fixes that get your site cited in AI answers.", tile: "suite-tile-optimizer", feeds: [] },
  { id: "runs", name: "Scans", group: "visibility", description: "Every scan across AI providers, with full answers.", tile: "suite-tile-scans", feeds: ["citations", "outreach"] },
  { id: "social", name: "Social search", group: "visibility", description: "People asking for tools like yours on Reddit, X and forums.", tile: "suite-tile-social", feeds: ["outreach"] },
  { id: "settings", name: "Settings", group: "admin", description: "Brand profile, AI keys, team, API access and billing.", tile: "suite-tile-settings", feeds: ["prospect", "queries", "social"] },
];

export function appById(id: AppId): SuiteApp {
  return SUITE_APPS.find((app) => app.id === id) ?? SUITE_APPS[0];
}

export const SETTINGS_SECTIONS = [
  { id: "brand", label: "Brand profile", hint: "Name, domain, logo, competitors", adminOnly: true },
  { id: "keys", label: "AI provider keys", hint: "Your own keys, custom providers", adminOnly: true },
  { id: "team", label: "Team", hint: "Members, roles, invite links", adminOnly: false },
  { id: "activity", label: "Activity log", hint: "Audit trail of workspace events", adminOnly: false },
  { id: "api", label: "API access", hint: "Programmatic access keys", adminOnly: false },
  { id: "billing", label: "Billing", hint: "Plan, credits and subscription", adminOnly: false },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

// What the brand profile drives in each app, shown beside the profile so it
// is clear one save updates the whole suite.
export const BRAND_PROFILE_USES: Array<{ app: AppId; use: string }> = [
  { app: "queries", use: "Scans measure your name and domain against these competitors in every AI answer." },
  { app: "prospect", use: "Research starts from your domain and category; tracked competitors are always checked." },
  { app: "social", use: "Searches look for people asking about your category and these competitors." },
  { app: "outreach", use: "Lead scores and message drafts use what you sell and who you compete with." },
];
