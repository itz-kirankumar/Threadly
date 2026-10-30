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

test("a founder on a work email with a B2B homepage and an outbound use case qualifies", () => {
  const fit = scoreApplicant({ email: "jo@acme.io", domain: "acme.io", role: "Co-founder & CEO", useCase: "Find mid-market finance teams and book outbound meetings for our sales team" }, b2bSite, 60);
  assert.equal(fit.qualified, true);
  assert.ok(fit.score >= 90, `score ${fit.score}`);
  assert.ok(fit.reasons.some((r) => r.includes("work email on the company's domain")));
});

test("a personal email with no readable site and no use case is waitlisted, with reasons", () => {
  const fit = scoreApplicant({ email: "someone@gmail.com", domain: "unknown.example", role: "", useCase: "" }, null, 60);
  assert.equal(fit.qualified, false);
  assert.equal(fit.score, 0);
  assert.deepEqual(fit.reasons, ["+0 personal email address", "+0 company homepage could not be read"]);
});

test("subdomains of the company count as the company's email domain", () => {
  assert.equal(emailDomain("A@Mail.Acme.io"), "mail.acme.io");
  const fit = scoreApplicant({ email: "a@mail.acme.io", domain: "acme.io", role: "", useCase: "" }, null, 60);
  assert.ok(fit.reasons.includes("+25 work email on the company's domain"));
});

test("the score never exceeds 100", () => {
  const fit = scoreApplicant({ email: "jo@acme.io", domain: "acme.io", role: "VP Sales", useCase: "outbound leads pipeline for our sales team across accounts in our ICP".repeat(3) }, b2bSite, 60);
  assert.ok(fit.score <= 100);
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
