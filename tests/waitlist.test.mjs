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

test("a founder with a team, outreach plan, work email and B2B site qualifies", () => {
  const fit = scoreApplicant(
    { email: "jo@acme.io", domain: "acme.io", role: "Co-founder & CEO", useCase: "Find mid-market finance teams and book outbound meetings", teamSize: "11-50", monthlyOutreach: "500-2000" },
    { ...b2bSite, readiness: 72 },
    60,
  );
  assert.equal(fit.qualified, true);
  assert.equal(fit.score, 100);
  assert.ok(fit.tests.every((t) => t.points === t.max));
});

test("a personal email with no readable site and nothing else is not onboarded, with every test shown", () => {
  const fit = scoreApplicant({ email: "someone@gmail.com", domain: "unknown.example", role: "", useCase: "" }, null, 60);
  assert.equal(fit.qualified, false);
  assert.equal(fit.score, 0);
  assert.equal(fit.tests.length, 9);
  assert.equal(fit.tests.reduce((s, t) => s + t.max, 0), 100, "tests total 100 points");
});

test("subdomains of the company count as the company's email domain", () => {
  assert.equal(emailDomain("A@Mail.Acme.io"), "mail.acme.io");
  const fit = scoreApplicant({ email: "a@mail.acme.io", domain: "acme.io", role: "", useCase: "" }, null, 60);
  assert.equal(fit.tests.find((t) => t.id === "email").points, 20);
});

test("a solo founder with a weak site falls below the bar", () => {
  const fit = scoreApplicant({ email: "me@solo.dev", domain: "solo.dev", role: "Founder", useCase: "", teamSize: "1", monthlyOutreach: "0-100" }, { name: "Solo", description: null, text: "", readiness: 30 }, 60);
  assert.equal(fit.qualified, false);
  assert.ok(fit.score < 60, `score ${fit.score}`);
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
  assert.equal(decideSignupAccess({ ...base, isApproved: true }), "allow");
  assert.equal(decideSignupAccess({ ...base, isApproved: false }), "block");
});

test("the waitlist route rejects a bad email and a bad domain before any lookup", async () => {
  const { POST } = await import("../src/app/api/waitlist/route.ts");
  const call = (body) => POST(new Request("http://localhost/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await call({ email: "nope", domain: "acme.io" })).status, 400);
  assert.equal((await call({ email: "a@acme.io", domain: "localhost" })).status, 400);
});
