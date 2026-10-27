import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
const { MemoryDraftStore, renderTemplate, templateVariables, contactEvidence } = await import("../src/lib/outbound/drafts.ts");
const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");
const { generateDrafts } = await import("../src/lib/outbound/draft-run.ts");

const NOW = new Date("2026-10-27T12:00:00Z");
const ISO = NOW.toISOString();

function campaignSpec(templates, allowed) {
  return {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["s1"], audienceQueryVersion: "q1", exclusions: [],
    templates, allowedPersonalization: allowed, followUpCount: 2, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25,
    costCeiling: { currency: "USD", amount: 10000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00Z", createdAt: ISO, createdBy: "u1",
  };
}
function validContact(contactId, fullName = "Ada Lovelace") {
  return {
    tenantId: "t1", contactId, accountId: "a1", email: `${contactId}@corp.example`,
    fullName, verification: { state: "valid", verifiedAt: ISO, verifier: "test" },
    employerChangedAt: null, createdAt: ISO, createdBy: "u1",
  };
}
function validRights(contactId) {
  return {
    tenantId: "t1", rightsId: `r-${contactId}`, contactId, sourceEvidenceId: "e1",
    intendedUse: "b2b_marketing", licensePermitsUse: true, subscriberClass: "corporate",
    lawfulBasis: "legitimate_interest", country: "US", createdAt: ISO, createdBy: "u1",
  };
}
async function setup(templates, allowed, contactId = "k1") {
  const campaigns = new MemoryCampaignStore();
  const campaign = campaignSpec(templates, allowed);
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, {
    tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW,
  });
  await enrollContact(campaigns, {
    tenantId: "t1", campaign, approvalId: approval.approvalId, contactId,
    exclusionGroup: contactId, actor: "u1", now: NOW,
  });
  const contacts = new MemoryContactStore();
  await contacts.saveContact(validContact(contactId));
  await contacts.saveRights(validRights(contactId));
  const ledger = new MemoryLedgerStore();
  const drafts = new MemoryDraftStore();
  const usage = new MemoryUsageStore();
  await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  // planner writes intents to the ledger; the campaign store keeps its own copy for listIntentsByCampaign
  const intents = await campaigns.listIntentsByCampaign("t1", "c1");
  assert.equal(intents.length, 1, "one intent planned");
  return { campaigns, ledger, contacts, drafts, usage };
}

test("renders a draft for an allowed, evidence-backed variable", async () => {
  const { campaigns, ledger, contacts, drafts, usage } = await setup(
    [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}, welcome." }],
    ["first_name", "full_name"]
  );
  const res = await generateDrafts({ campaigns, ledger, contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.rendered.length, 1);
  assert.equal(res.skipped.length, 0);
  const draft = await drafts.listDrafts("t1").then((d) => d[0]);
  assert.equal(draft.subject, "Hi Ada");
  assert.equal(draft.body, "Hello Ada Lovelace, welcome.");
  assert.equal(draft.engine, "template");
  assert.equal(res.usageRecorded.length, 1);
  const events = await usage.listUsage("t1");
  assert.equal(events[0].costMinorUnits, 0);
});

test("fails closed on a variable outside allowedPersonalization", async () => {
  const { campaigns, ledger, contacts, drafts, usage } = await setup(
    [{ step: 1, subject: "Hi", body: "About {{secret_thing}}" }],
    []
  );
  const res = await generateDrafts({ campaigns, ledger, contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.rendered.length, 0);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["variable_not_allowed:secret_thing"]);
  assert.equal((await drafts.listDrafts("t1")).length, 0);
  assert.equal((await usage.listUsage("t1")).length, 0);
});

test("fails closed when an allowed variable has no evidence value", async () => {
  const { campaigns, ledger, contacts, drafts, usage } = await setup(
    [{ step: 1, subject: "Hi {{title}}", body: "Body" }],
    ["title"]
  );
  // contact has no title in contactEvidence
  const res = await generateDrafts({ campaigns, ledger, contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.rendered.length, 0);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["evidence_missing:title"]);
});

test("idempotent: a second run renders nothing and records no new usage", async () => {
  const { campaigns, ledger, contacts, drafts, usage } = await setup(
    [{ step: 1, subject: "Hi {{first_name}}", body: "Body" }],
    ["first_name"]
  );
  const first = await generateDrafts({ campaigns, ledger, contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(first.rendered.length, 1);
  const second = await generateDrafts({ campaigns, ledger, contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(second.rendered.length, 0);
  assert.deepEqual(second.skipped.map((s) => s.reason), ["draft_exists"]);
  assert.equal((await usage.listUsage("t1")).length, 1);
});

test("skips intents not in drafted status", async () => {
  const { campaigns, ledger, contacts, drafts, usage } = await setup(
    [{ step: 1, subject: "Hi", body: "Body" }], []
  );
  const intents = await campaigns.listIntentsByCampaign("t1", "c1");
  const cancelled = { ...intents[0], status: "cancelled" };
  await campaigns.saveIntent(cancelled);
  const res = await generateDrafts({ campaigns, ledger, contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.rendered.length, 0);
  assert.equal(res.skipped.length, 0);
});

test("renderTemplate handles templates with no variables and missing step", async () => {
  const campaign = campaignSpec([{ step: 1, subject: "Plain", body: "No vars" }], []);
  assert.equal(renderTemplate(campaign, { step: 1 }, {}).ok, true);
  assert.equal(renderTemplate(campaign, { step: 2 }, {}).reasons[0], "no_template_for_step:2");
  assert.deepEqual(templateVariables("{{a}} and {{ b }}"), ["a", "b"]);
  assert.equal(contactEvidence(validContact("x")).first_name, "Ada");
});
