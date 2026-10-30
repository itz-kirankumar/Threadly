// Onboarding qualification for the invite-only beta. An applicant runs a set
// of business-capability tests; each test is worth fixed points and the
// total is out of 100. Clearing the bar onboards them at once; anyone below
// it is told plainly that we cannot onboard them now. Every test reads
// something checkable: their email, their company's own homepage and its
// readiness audit, and what they told us. Dependency-free so it is
// unit-testable in plain node.

export interface ApplicantInput {
  email: string;
  domain: string;
  role: string;
  useCase: string;
  teamSize?: string; // "1" | "2-10" | "11-50" | "51-200" | "200+"
  monthlyOutreach?: string; // "0-100" | "100-500" | "500-2000" | "2000+"
}

// What Threadly could read on the applicant's homepage; null when it could
// not be reached.
export interface ApplicantSite {
  name: string;
  description: string | null;
  text: string;
  readiness?: number | null; // AI readiness audit score, 0-100
}

export interface QualificationTest {
  id: string;
  label: string;
  points: number;
  max: number;
  passed: boolean;
  detail: string;
}

export interface FitScore {
  score: number;
  qualified: boolean;
  tests: QualificationTest[];
  reasons: string[];
}

export const QUALIFY_SCORE = Number(process.env.WAITLIST_QUALIFY_SCORE ?? "60");

export const TEAM_SIZES = ["1", "2-10", "11-50", "51-200", "200+"] as const;
export const OUTREACH_VOLUMES = ["0-100", "100-500", "500-2000", "2000+"] as const;

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mail.com", "yandex.com",
  "zoho.com", "qq.com", "163.com", "rediffmail.com", "fastmail.com", "hey.com", "tutanota.com",
]);

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
const OUTBOUND_USE = /\b(outbound|prospect\w*|leads?|pipeline|cold (email|outreach)|sales|customers|icp|accounts?)\b/i;

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
  const test = (id: string, label: string, max: number, points: number, detail: string) =>
    tests.push({ id, label, max, points, passed: points > 0, detail });

  const mailDomain = emailDomain(input.email);
  if (FREE_MAIL.has(mailDomain)) test("email", "Work email", 20, 0, "Personal email address");
  else if (sameCompany(mailDomain, input.domain)) test("email", "Work email", 20, 20, "On the company's own domain");
  else test("email", "Work email", 20, 8, "Business email on another domain");

  test("site", "Company website is live", 10, site ? 10 : 0, site ? "Homepage read" : "Homepage could not be read");
  test("clear", "Website says what you do", 8, site?.description && site.description.length >= 30 ? 8 : 0, site?.description ? "Clear description found" : "No clear description");
  const hits = site ? B2B_SIGNALS.filter((re) => re.test(`${site.description ?? ""} ${site.text}`)).length : 0;
  test("b2b", "Sells to businesses", 15, Math.min(15, hits * 3), `${hits} of ${B2B_SIGNALS.length} B2B signals on the homepage`);
  const readiness = site?.readiness ?? null;
  test("readiness", "Web presence ready (audit 50+)", 10, readiness !== null && readiness >= 50 ? 10 : 0, readiness === null ? "Not audited" : `AI readiness ${readiness}/100`);

  if (DECISION_ROLE.test(input.role)) test("role", "Decision maker", 12, 12, input.role);
  else if (GTM_ROLE.test(input.role)) test("role", "Decision maker", 12, 8, `${input.role} (sales, growth or marketing)`);
  else test("role", "Decision maker", 12, 0, input.role ? input.role : "Role not given");

  const useCase = input.useCase.trim();
  test("usecase", "Lead generation use case", 10, OUTBOUND_USE.test(useCase) ? 10 : useCase.length >= 40 ? 4 : 0, useCase ? (OUTBOUND_USE.test(useCase) ? "About finding customers" : "Described, not about leads") : "Not described");

  const team = input.teamSize ?? "";
  test("team", "Team in place", 8, team === "1" ? 3 : team && (TEAM_SIZES as readonly string[]).includes(team) ? 8 : 0, team ? `${team} people` : "Not given");
  const volume = input.monthlyOutreach ?? "";
  test("volume", "Outreach capacity", 7, volume === "500-2000" || volume === "2000+" ? 7 : volume === "100-500" ? 4 : 0, volume ? `${volume} prospects a month` : "Not given");

  const score = Math.min(100, tests.reduce((s, t) => s + t.points, 0));
  return {
    score,
    qualified: score >= threshold,
    tests,
    reasons: tests.map((t) => `+${t.points} ${t.label.toLowerCase()}: ${t.detail}`),
  };
}
