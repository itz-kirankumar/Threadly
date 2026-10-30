import { readJsonBody, RequestError } from "@/lib/api-request";
import { sendLifecycleEmail } from "@/lib/email";
import { parseAuditDomain } from "@/lib/geo/openseo-engine";
import { fetchPage } from "@/lib/prospecting/web";
import { checkRateLimit, requestAddressKey } from "@/lib/rate-limit";
import { scoreApplicant, type ApplicantSite } from "@/lib/waitlist/score";
import { loadApplication, saveApplication, type WaitlistApplication } from "@/lib/waitlist/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Beta access request. Scores the applicant's lead-generation fit from their
// email, their company homepage and what they tell us; a qualifying score is
// invited at once (approved list + invite email), anyone else is waitlisted.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
  } catch (error) {
    return Response.json({ error: "Send the form again." }, { status: error instanceof RequestError ? error.status : 400 });
  }
  const email = clean(body.email, 120).toLowerCase();
  const domain = parseAuditDomain(clean(body.domain, 120));
  const role = clean(body.role, 80);
  const useCase = clean(body.useCase, 600);
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!domain) return Response.json({ error: "Enter your company website, like acme.com." }, { status: 400 });

  const limit = await checkRateLimit(`waitlist:${requestAddressKey(request)}`, 8, 3600);
  if (limit && !limit.allowed) {
    return Response.json({ error: "Too many requests. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const existing = await loadApplication(email).catch(() => null);
  if (existing?.status === "invited") {
    return Response.json({ status: "invited", score: existing.score, reasons: existing.reasons, already: true });
  }

  let site: ApplicantSite | null = null;
  let company = domain;
  try {
    const page = await fetchPage(domain, 8000);
    company = page.siteName ?? domain;
    site = { name: company, description: page.description, text: [page.title, ...page.headings, ...page.paragraphs.slice(0, 12)].filter(Boolean).join(" ").slice(0, 6000) };
  } catch {
    site = null;
  }

  const fit = scoreApplicant({ email, domain, role, useCase }, site);
  const now = new Date().toISOString();
  const application: WaitlistApplication = {
    email,
    domain,
    role,
    useCase,
    score: fit.score,
    reasons: fit.reasons,
    status: fit.qualified ? "invited" : "waitlisted",
    appliedAt: existing?.appliedAt ?? now,
    ...(fit.qualified ? { invitedAt: now } : {}),
  };
  try {
    await saveApplication(application);
  } catch (error) {
    console.error("[waitlist] save failed", error);
    return Response.json({ error: "Your request could not be saved. Try again shortly." }, { status: 503 });
  }
  // Only the first waitlist email is sent; re-applying does not resend it.
  if (fit.qualified || !existing) {
    await sendLifecycleEmail(fit.qualified ? "beta-invite" : "beta-waitlisted", email, { company });
  }
  return Response.json({ status: application.status, score: fit.score, reasons: fit.reasons });
}
