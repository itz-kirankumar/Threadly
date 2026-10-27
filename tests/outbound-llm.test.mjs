import { test } from "node:test";
import assert from "node:assert/strict";

const { validateModelOutput } = await import("../src/lib/outbound/llm/types.ts");
const { MockLLMProvider } = await import("../src/lib/outbound/llm/mock.ts");
const { HttpLLMProvider, LLMNotConfiguredError } = await import("../src/lib/outbound/llm/http.ts");

const request = {
  intentId: "i1", step: 1,
  template: { subject: "Hi {{first_name}}", body: "Hello {{full_name}}" },
  evidence: { first_name: "Ada", full_name: "Ada Lovelace" },
  allowedVariables: ["first_name", "full_name", "company_signal"],
};

test("validateModelOutput rejects non-allowlisted and evidence-less variables", () => {
  assert.deepEqual(validateModelOutput({ subject: "Hi {{first_name}}", body: "x" }, request), []);
  assert.ok(validateModelOutput({ subject: "Hi {{secret_thing}}", body: "x" }, request).includes("variable_not_allowlisted:secret_thing"));
  assert.ok(validateModelOutput({ subject: "Hi {{company_signal}}", body: "x" }, request).includes("variable_without_evidence:company_signal"));
});

test("mock provider fills only evidenced allowlisted variables", async () => {
  const out = await new MockLLMProvider().personalize(request);
  assert.equal(out.ok, true);
  assert.equal(out.subject, "Hi Ada");
  assert.equal(out.body, "Hello Ada Lovelace");
  assert.deepEqual(out.usedVariables.sort(), ["first_name", "full_name"]);
  // allowlisted but unevidenced: never invented, rejected
  const unevidenced = await new MockLLMProvider().personalize({ ...request, template: { subject: "Hi {{first_name}}", body: "saw {{company_signal}}" } });
  assert.equal(unevidenced.ok, false);
  assert.ok(unevidenced.reasons[0].includes("variable_without_evidence"));
  // non-allowlisted: rejected
  const bad = await new MockLLMProvider().personalize({ ...request, template: { subject: "Hi {{password}}", body: "x" } });
  assert.equal(bad.ok, false);
});

test("http provider: unconfigured refuses; stubbed endpoint validated", async () => {
  delete process.env.OUTBOUND_LLM_BASE_URL;
  assert.throws(() => new HttpLLMProvider(), LLMNotConfiguredError);
  process.env.OUTBOUND_LLM_BASE_URL = "https://llm.example";
  process.env.OUTBOUND_LLM_API_KEY = "k";
  process.env.OUTBOUND_LLM_MODEL = "m";

  const good = new HttpLLMProvider(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ subject: "Hi {{first_name}}", body: "Body {{full_name}}" }) } }],
  }), { status: 200 }));
  const out = await good.personalize(request);
  assert.equal(out.ok, true);
  assert.equal(out.subject, "Hi {{first_name}}");

  // injection attempt: model output tries a non-allowlisted variable
  const evil = new HttpLLMProvider(async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ subject: "Hi {{internal_notes}}", body: "x" }) } }],
  }), { status: 200 }));
  const rejected = await evil.personalize(request);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.reasons[0].includes("variable_not_allowlisted"));

  const down = new HttpLLMProvider(async () => new Response("err", { status: 500 }));
  assert.deepEqual((await down.personalize(request)).reasons, ["llm_http_500"]);

  delete process.env.OUTBOUND_LLM_BASE_URL;
  delete process.env.OUTBOUND_LLM_API_KEY;
  delete process.env.OUTBOUND_LLM_MODEL;
});

test("llm-assisted campaign falls back to approved template with recorded reason", async () => {
  const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
  const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
  const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
  const { MemoryDraftStore } = await import("../src/lib/outbound/drafts.ts");
  const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");
  const { generateDrafts } = await import("../src/lib/outbound/draft-run.ts");
const UNSUB = { baseUrl: "https://app.test", secret: "test-secret" };
  const NOW = new Date("2026-10-27T12:00:00Z");
  const campaigns = new MemoryCampaignStore();
  const campaign = {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["snd_1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 0, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 100 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2027-01-01T00:00:00Z",
    personalizationEngine: "llm-assisted",
    createdAt: NOW.toISOString(), createdBy: "u1",
  };
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, { tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW });
  await enrollContact(campaigns, { tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k1", exclusionGroup: "k1", actor: "u1", now: NOW });
  const contacts = new MemoryContactStore();
  await contacts.saveContact({
    tenantId: "t1", contactId: "k1", accountId: "a1", email: "ada@acme.com", fullName: "Ada Lovelace",
    verification: { state: "valid", verifiedAt: NOW.toISOString(), verifier: "test" },
    employerChangedAt: null, createdAt: NOW.toISOString(), createdBy: "u1",
  });
  await contacts.saveRights({
    tenantId: "t1", rightsId: "rr_1", contactId: "k1", sourceEvidenceId: "ev1",
    intendedUse: "b2b_marketing", licensePermitsUse: true, subscriberClass: "corporate",
    lawfulBasis: "test", country: "US", createdAt: NOW.toISOString(), createdBy: "u1",
  });
  const ledger = new MemoryLedgerStore();
  const drafts = new MemoryDraftStore();
  const usage = new MemoryUsageStore();
  await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });

  // No provider injected: explicit fallback, reason recorded
  let result = await generateDrafts({ campaigns, ledger, contacts, drafts, usage , unsubscribe: UNSUB}, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(result.rendered.length, 1);
  const draft = [...drafts.drafts.values()][0];
  assert.equal(draft.engine, "template-fallback");
  assert.equal(draft.fallbackReason, "llm_not_configured");
  assert.equal(draft.subject, "Hi Ada");

  // Mock provider: engine marked, usage synthetic
  const drafts2 = new MemoryDraftStore();
  const usage2 = new MemoryUsageStore();
  const campaigns2 = campaigns;
  const intents = await campaigns2.listIntentsByCampaign("t1", "c1");
  for (const i of intents) await campaigns2.saveIntent({ ...i, status: "drafted" });
  result = await generateDrafts({ campaigns: campaigns2, ledger, contacts, drafts: drafts2, usage: usage2, llm: new MockLLMProvider() , unsubscribe: UNSUB}, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(result.rendered.length, 1);
  const draft2 = [...drafts2.drafts.values()][0];
  assert.equal(draft2.engine, "mock-llm");
  assert.equal([...usage2.events.values()][0].synthetic, true);
});
