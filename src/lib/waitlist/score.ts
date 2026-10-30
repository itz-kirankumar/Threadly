// Onboarding qualification for the invite-only platform. An applicant runs
// tests in four groups worth 100 points, weighted towards what can be checked
// (their domain, its mail records, its age, their homepage) over what they
// typed. Hard requirements come first: missing one means no onboarding at any
// score. Dependency-free so it is unit-testable in plain node.

export interface ApplicantInput {
  email: string;
  domain: string;
  role: string;
  useCase: string;
  teamSize?: string;
  monthlyOutreach?: string;
  monthlyBudget?: string;
  crm?: string;
}

// What could be read about the company; null when its homepage could not be.
export interface ApplicantSite {
  name: string;
  description: string | null;
  text: string;
  readiness?: number | null; // AI readiness audit, 0-100
  commercial?: number | null; // business signals on the homepage, 0-10
  mail?: { mx: boolean; spf: boolean; dmarc: boolean } | null;
  domainAgeDays?: number | null;
}

export type TestGroup = "Identity" | "Business" | "Capacity" | "Intent";

export interface QualificationTest {
  id: string;
  group: TestGroup;
  label: string;
  points: number;
  max: number;
  passed: boolean;
  detail: string;
}

export interface FitScore {
  score: number;
  qualified: boolean;
  blockers: string[];
  tests: QualificationTest[];
  reasons: string[];
}

export const QUALIFY_SCORE = Number(process.env.WAITLIST_QUALIFY_SCORE ?? "70");
export const MAX_APPLICATIONS = 3; // per email, so answers cannot be tuned to pass
const MIN_DOMAIN_AGE_DAYS = 90;

export const TEAM_SIZES = ["1", "2-10", "11-50", "51-200", "200+"] as const;
export const OUTREACH_VOLUMES = ["0-100", "100-500", "500-2000", "2000+"] as const;
export const BUDGETS = ["Under $50", "$50-200", "$200-1,000", "$1,000+"] as const;
export const CRMS = ["None", "Spreadsheets", "HubSpot", "Salesforce", "Other CRM"] as const;

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mail.com", "yandex.com",
  "zoho.com", "qq.com", "163.com", "rediffmail.com", "fastmail.com", "hey.com", "tutanota.com",
]);
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com"]);
const SHARED_INBOX = /^(info|hello|contact|admin|support|sales|team|office|mail)@/i;

// Signs a company sells to other businesses, the buyers Threadly finds.
const B2B_SIGNALS = [
  /\bfor (teams|businesses|companies|enterprises?|agencies|startups)\b/i,
  /\b(b2b|saas|enterprise|platform|api|integrations?)\b/i,
  /\b(book a demo|request a demo|talk to sales|contact sales|get a demo)\b/i,
  /\b(pricing|plans)\b/i,
  /\b(customers|case stud(y|ies)|trusted by)\b/i,
];

const DECISION_ROLE = /\b(founder|co-?founder|ceo|cro|cmo|coo|owner|president|head|vp|vice president|director|partner|chief)\b/i;
const GTM_ROLE = /\b(sales|growth|marketing|revenue|business development|bd|sdr|bdr|account executive|demand gen|partnerships)\b/i;
const OUTBOUND_USE = /\b(outbound|prospect\w*|leads?|pipeline|cold (email|outreach)|sales|icp|accounts?)\b/i;
const NAMES_A_BUYER = /\b(heads?|vp|directors?|founders?|ceos?|cfos?|cmos?|managers?|teams?|companies|startups|agencies|firms|smbs?|mid-market|enterprise)\b/i;

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

function sameCompany(a: string, b: string): boolean {
  const strip = (d: string) => d.replace(/^www\./, "");
  const x = strip(a);
  const y = strip(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

export function scoreApplicant(input: ApplicantInput, site: ApplicantSite | null, threshold = QUALIFY_SCORE): FitScore {
  const tests: QualificationTest[] = [];
  const blockers: string[] = [];
  const test = (group: TestGroup, id: string, label: string, max: number, points: number, detail: string) =>
    tests.push({ id, group, label, max, points, passed: points >= max, detail });

  // Identity: is this a real company address on a real, established domain?
  const mailDomain = emailDomain(input.email);
  const free = FREE_MAIL.has(mailDomain);
  const disposable = DISPOSABLE.has(mailDomain);
  const matches = !free && !disposable && sameCompany(mailDomain, input.domain);
  if (free || disposable) blockers.push("Apply with a work email, not a personal or temporary address.");
  else if (!matches) blockers.push("Your email must be on the company domain you entered.");
  const shared = SHARED_INBOX.test(input.email);
  test("Identity", "email", "Personal work email on the company domain", 15, !matches ? 0 : shared ? 8 : 15, !matches ? (free || disposable ? "Personal or temporary address" : "Different domain") : shared ? "Shared inbox" : "Verified on sign-in");
  const mail = site?.mail ?? null;
  test("Identity", "mx", "Domain receives email", 5, mail?.mx ? 5 : 0, mail ? (mail.mx ? "MX records found" : "No MX records") : "Not checked");
  const age = site?.domainAgeDays ?? null;
  if (age !== null && age < MIN_DOMAIN_AGE_DAYS) blockers.push("Your company domain was registered very recently.");
  test("Identity", "age", "Established domain", 10, age === null ? 0 : age >= 730 ? 10 : age >= 365 ? 7 : age >= MIN_DOMAIN_AGE_DAYS ? 3 : 0, age === null ? "Age not available" : `Registered ${age >= 365 ? `${Math.floor(age / 365)} years` : `${age} days`} ago`);

  // Business: does the website show a company selling to businesses?
  if (!site) blockers.push("We could not read your company website.");
  test("Business", "site", "Website is live", 5, site ? 5 : 0, site ? "Homepage read" : "Could not be read");
  test("Business", "clear", "Website says what you do", 5, site?.description && site.description.length >= 30 ? 5 : 0, site?.description ? "Clear description" : "No clear description");
  const hits = site ? B2B_SIGNALS.filter((re) => re.test(`${site.description ?? ""} ${site.text}`)).length : 0;
  if (site && hits === 0) blockers.push("Your website shows no sign of selling to businesses.");
  test("Business", "b2b", "Sells to businesses", 10, hits >= 3 ? 10 : hits * 3, `${hits} of ${B2B_SIGNALS.length} signals`);
  const commercial = site?.commercial ?? null;
  test("Business", "commercial", "Pricing, contact and policy pages", 8, commercial === null ? 0 : Math.round((commercial / 10) * 8), commercial === null ? "Not checked" : `${commercial}/10 on the homepage`);
  const readiness = site?.readiness ?? null;
  test("Business", "readiness", "Web presence (audit 60+)", 7, readiness === null ? 0 : readiness >= 60 ? 7 : readiness >= 40 ? 3 : 0, readiness === null ? "Not audited" : `AI readiness ${readiness}/100`);

  // Capacity: can the team act on leads and pay for them?
  const sending = (mail?.spf ? 4 : 0) + (mail?.dmarc ? 3 : 0);
  test("Capacity", "sending", "Sending domain set up (SPF, DMARC)", 7, sending, mail ? `SPF ${mail.spf ? "yes" : "no"}, DMARC ${mail.dmarc ? "yes" : "no"}` : "Not checked");
  const team = input.teamSize ?? "";
  test("Capacity", "team", "Team in place", 6, team === "1" ? 2 : (TEAM_SIZES as readonly string[]).includes(team) ? 6 : 0, team ? `${team} people` : "Not given");
  const volume = input.monthlyOutreach ?? "";
  test("Capacity", "volume", "Outreach volume", 5, volume === "500-2000" || volume === "2000+" ? 5 : volume === "100-500" ? 3 : 0, volume ? `${volume} a month` : "Not given");
  const budget = input.monthlyBudget ?? "";
  test("Capacity", "budget", "Budget for lead generation", 7, budget === "$200-1,000" || budget === "$1,000+" ? 7 : budget === "$50-200" ? 4 : 0, budget || "Not given");

  // Intent: is this the right person with a defined target?
  test("Intent", "role", "Decision maker", 5, DECISION_ROLE.test(input.role) ? 5 : GTM_ROLE.test(input.role) ? 3 : 0, input.role || "Not given");
  const useCase = input.useCase.trim();
  const defined = useCase.length >= 40 && NAMES_A_BUYER.test(useCase);
  test("Intent", "icp", "Defined target customer", 3, defined ? 3 : 0, defined ? "Names who you sell to" : "Not specific");
  const crm = input.crm ?? "";
  test("Intent", "process", "Lead generation in practice", 2, OUTBOUND_USE.test(useCase) || (crm && crm !== "None") ? 2 : 0, crm && crm !== "None" ? crm : "No current process");

  const score = Math.min(100, tests.reduce((s, t) => s + t.points, 0));
  return {
    score,
    qualified: score >= threshold && blockers.length === 0,
    blockers,
    tests,
    reasons: [...blockers, ...tests.map((t) => `+${t.points} ${t.label.toLowerCase()}: ${t.detail}`)],
  };
}
