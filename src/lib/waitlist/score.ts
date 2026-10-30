// Lead-generation fit score for beta applicants. Threadly is invite-only:
// an applicant is invited automatically when the score clears the bar,
// otherwise they stay on the waitlist. Every point comes from something
// checkable (their email, their own homepage, what they told us), and the
// reasons are kept so the decision can be explained. Dependency-free so it
// is unit-testable in plain node.

export interface ApplicantInput {
  email: string;
  domain: string;
  role: string;
  useCase: string;
}

// What Threadly could read on the applicant's homepage; null when it could
// not be reached.
export interface ApplicantSite {
  name: string;
  description: string | null;
  text: string;
}

export interface FitScore {
  score: number;
  qualified: boolean;
  reasons: string[];
}

export const QUALIFY_SCORE = Number(process.env.WAITLIST_QUALIFY_SCORE ?? "60");

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
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  const mailDomain = emailDomain(input.email);
  if (FREE_MAIL.has(mailDomain)) reasons.push("+0 personal email address");
  else if (sameCompany(mailDomain, input.domain)) add(25, "work email on the company's domain");
  else add(10, "work email on another domain");

  if (site) {
    add(15, "company homepage is live and readable");
    if (site.description && site.description.length >= 30) add(10, "homepage states what the company does");
    const text = `${site.description ?? ""} ${site.text}`;
    const hits = B2B_SIGNALS.filter((re) => re.test(text)).length;
    if (hits) add(Math.min(20, hits * 5), `sells to businesses (${hits} signal${hits === 1 ? "" : "s"} on the homepage)`);
  } else {
    reasons.push("+0 company homepage could not be read");
  }

  if (DECISION_ROLE.test(input.role)) add(15, "decision maker");
  else if (GTM_ROLE.test(input.role)) add(10, "sales, growth or marketing role");

  const useCase = input.useCase.trim();
  if (useCase.length >= 40) add(5, "described the use case");
  if (OUTBOUND_USE.test(useCase)) add(10, "use case is lead generation");

  score = Math.min(100, score);
  return { score, qualified: score >= threshold, reasons };
}
