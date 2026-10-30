import { test } from "node:test";
import assert from "node:assert/strict";

const { scoreApplicant, emailDomain } = await import("../src/lib/waitlist/score.ts");
const store = await import("../src/lib/waitlist/store.ts");
const { decideSignupAccess } = await import("../src/lib/geo/signup-gate.ts");

const b2bSite = {
  name: "Acme",
  description: "Acme is the revenue forecasting platform for B2B sales teams.",
  text: "Built for teams. Book a demo. Pricing. Trusted by 400 customers. Integrations with Salesforce.",
};

const strong = { ...b2bSite, readiness: 72, commercial: 10, mail: { mx: true, spf: true, dmarc: true }, domainAgeDays: 1500 };
const founder = { email: "jo@acme.io", domain: "acme.io", role: "Co-founder & CEO", useCase: "Heads of finance at mid-market SaaS companies, reached by outbound email", teamSize: "11-50", monthlyOutreach: "500-2000", monthlyBudget: "$200-1,000", crm: "HubSpot" };

test("an established B2B company with a team, budget and sending setup scores full marks", () => {
  const fit = scoreApplicant(founder, strong, 70);
  assert.equal(fit.qualified, true);
  assert.equal(fit.score, 100);
  assert.deepEqual(fit.blockers, []);
  assert.equal(fit.tests.reduce((s, t) => s + t.max, 0), 100, "tests total 100 points");
  assert.ok(fit.tests.every((t) => t.passed));
});

test("hard requirements stop onboarding at any score", () => {
  assert.equal(scoreApplicant({ ...founder, email: "jo@gmail.com" }, strong, 10).qualified, false);
  assert.equal(scoreApplicant({ ...founder, email: "jo@mailinator.com" }, strong, 10).qualified, false);
  assert.equal(scoreApplicant({ ...founder, email: "jo@other.io" }, strong, 10).qualified, false);
  assert.equal(scoreApplicant(founder, { ...strong, domainAgeDays: 30 }, 10).qualified, false);
  assert.equal(scoreApplicant(founder, { ...strong, description: null, text: "A blog about my holidays" }, 10).qualified, false);
  assert.equal(scoreApplicant(founder, null, 0).qualified, false);
});

test("a lookup that failed scores nothing but blocks nothing", () => {
  const fit = scoreApplicant(founder, { ...strong, mail: null, domainAgeDays: null }, 70);
  assert.deepEqual(fit.blockers, []);
  assert.equal(fit.score, 100 - 5 - 10 - 7);
  assert.equal(fit.qualified, true);
});

test("shared inboxes and thin capacity lose points", () => {
  const fit = scoreApplicant({ ...founder, email: "info@acme.io", teamSize: "1", monthlyOutreach: "0-100", monthlyBudget: "Under $50", crm: "None" }, { ...strong, mail: { mx: true, spf: false, dmarc: false }, domainAgeDays: 200 }, 70);
  assert.equal(fit.tests.find((t) => t.id === "email").points, 8);
  assert.equal(fit.qualified, false);
  assert.ok(fit.score < 70, `score ${fit.score}`);
});

test("subdomains of the company count as the company's email domain", () => {
  assert.equal(emailDomain("A@Mail.Acme.io"), "mail.acme.io");
  const fit = scoreApplicant({ ...founder, email: "a@mail.acme.io" }, strong, 70);
  assert.equal(fit.tests.find((t) => t.id === "email").points, 15);
});

test("an invited application is approved; a waitlisted one is not (in-memory store)", async () => {
  const base = { domain: "acme.io", role: "", useCase: "", score: 80, reasons: [], appliedAt: "2026-10-30T00:00:00Z" };
  await store.saveApplication({ ...base, email: "In@Acme.io", status: "invited", invitedAt: "2026-10-30T00:00:00Z" });
  await store.saveApplication({ ...base, email: "wait@acme.io", status: "waitlisted" });
  assert.equal(await store.isEmailApproved("in@acme.io"), true, "case-insensitive");
  assert.equal(await store.isEmailApproved("wait@acme.io"), false);
  assert.equal(await store.isEmailApproved(undefined), false);
});

test("the signup gate admits approved emails only", () => {
  const base = { isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: false };
  assert.equal(decideSignupAccess({ ...base, isApproved: true, emailVerified: true }), "allow");
  assert.equal(decideSignupAccess({ ...base, isApproved: false }), "block");
});

test("the waitlist route rejects a bad email and a bad domain before any lookup", async () => {
  const { POST } = await import("../src/app/api/waitlist/route.ts");
  const call = (body) => POST(new Request("http://localhost/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await call({ email: "nope", domain: "acme.io" })).status, 400);
  assert.equal((await call({ email: "a@acme.io", domain: "localhost" })).status, 400);
});
