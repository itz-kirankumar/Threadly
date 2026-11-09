// Companies hiring for the work a product supports, from public job posts.
// A company hiring SDRs is shopping for sales tools; one hiring a placement
// officer needs help placing students. The idea follows JobSpy
// (github.com/speedyapply/JobSpy): job boards are a buying signal. Only the
// posts' public search results are read, on applicant-tracking boards that
// put the hiring company in the URL; no applicant or employee data is
// collected.

import type { SearchHit } from "./web.ts";

// Roles a buyer of each kind of product hires for.
const HIRING_ROLES: Array<[RegExp, string[]]> = [
  [/\b(crm|sales|prospecting|lead gen\w*|outbound|cold email|pipeline)\b/i, ["Sales Development Representative", "Account Executive", "Head of Sales"]],
  [/\b(seo|content|social media|ads|advertising|marketing|newsletter|growth|reviews?|reputation)\b/i, ["Growth Marketer", "Content Marketing Manager", "SEO Specialist"]],
  [/\b(customer support|help ?desk|ticketing|live chat|chat ?bot|customer success)\b/i, ["Customer Support Specialist", "Customer Success Manager"]],
  [/\b(hr|hiring|recruit\w*|payroll|onboarding)\b/i, ["Recruiter", "Talent Acquisition Specialist"]],
  [/\b(analytics|data|dashboards?|bi)\b/i, ["Data Analyst", "Growth Analyst"]],
  [/\b(api|developer|devops|database|hosting|observability|infrastructure)\b/i, ["DevOps Engineer", "Platform Engineer"]],
  [/\b(design|figma|ui|ux|branding)\b/i, ["Product Designer", "Brand Designer"]],
  [/\b(career|interview|resume|placement|job search)\b/i, ["Training and Placement Officer", "Career Services Coordinator"]],
  [/\b(forms?|surveys?|feedback|testimonials?)\b/i, ["Product Marketing Manager", "Customer Experience Manager"]],
];

export function hiringRoles(text: string): string[] {
  return HIRING_ROLES.find(([re]) => re.test(text))?.[1] ?? [];
}

// Boards that name the hiring company in the post's URL.
// Startup boards first: small companies hire there, so they lead the list.
export const JOB_BOARDS = ["wellfound.com", "jobs.ashbyhq.com", "apply.workable.com", "jobs.lever.co", "boards.greenhouse.io", "job-boards.greenhouse.io"];
const STARTUP_BOARDS = /wellfound\.com|ashbyhq\.com|workable\.com/;

export interface JobPost {
  // The company's slug on the board ("acme" in jobs.lever.co/acme/...).
  slug: string;
  role: string;
  url: string;
  title: string;
  postedAt: string | null;
}

export function jobPostFromResult(hit: Pick<SearchHit, "url" | "title" | "published">, role: string): JobPost | null {
  let u: URL;
  try {
    u = new URL(hit.url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  let slug: string | undefined;
  if (/greenhouse\.io$|lever\.co$|ashbyhq\.com$|workable\.com$/.test(host)) slug = parts[0];
  else if (host.endsWith("wellfound.com") && parts[0] === "company") slug = parts[1];
  // A post, not the board's own pages.
  if (!slug || parts.length < 2 || /^(jobs|embed|api|search|careers|about|login|signup|company|companies)$/i.test(slug)) return null;
  return { slug: slug.toLowerCase(), role, url: hit.url, title: hit.title, postedAt: hit.published };
}

// Recent public job posts for the roles, one search per role.
export async function findJobPosts(roles: string[], country: string | null, search: (q: string, max: number, options: { includeDomains: string[]; timeRange?: "month" | "year" }) => Promise<SearchHit[]>, log: (t: string) => void): Promise<JobPost[]> {
  const posts: JobPost[] = [];
  const seen = new Set<string>();
  await Promise.all(roles.slice(0, 3).map(async (role) => {
    const q = `${role} job${country ? ` ${country}` : ""}`;
    log(`searching public job posts: "${q}"`);
    const hits = await search(q, 20, { includeDomains: JOB_BOARDS, timeRange: "month" }).catch(() => [] as SearchHit[]);
    let kept = 0;
    for (const h of hits) {
      const post = jobPostFromResult(h, role);
      if (!post || seen.has(post.slug)) continue;
      seen.add(post.slug);
      posts.push(post);
      kept++;
    }
    log(`  "${role}": ${kept} companies hiring`);
  }));
  // Posts on startup boards first: small companies like the visitor's.
  return posts.sort((a, b) => Number(STARTUP_BOARDS.test(b.url)) - Number(STARTUP_BOARDS.test(a.url)));
}
