import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
const { advanceEnrollments } = await import("../src/lib/outbound/sequence.ts");

const NOW = new Date("2026-10-27T12:00:00Z");
const ISO = NOW.toISOString();

function campaignSpec(followUpCount) {
  return {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["s1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [
      { step: 1, subject: "One", body: "First" },
      { step: 2, subject: "Two", body: "Second" },
    ],
    allowedPersonalization: [], followUpCount, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25,
    costCeiling: { currency: "USD", amount: 10000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00Z", createdAt: ISO, createdBy: "u1",
  };
}
function validContact(contactId) {
  return {
    tenantId: "t1", contactId, accountId: "a1", email: `${contactId}@corp.example`,
    fullName: "Ada Lovelace", verification: { state: "valid", verifiedAt: ISO, verifier: "test" },
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
async function setup(followUpCount = 1) {
  const campaigns = new MemoryCampaignStore();
  const campaign = campaignSpec(followUpCount);
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, {
    tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW,
  });
  await enrollContact(campaigns, {
    tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k1",
    exclusionGroup: "k1", actor: "u1", now: NOW,
  });
  const contacts = new MemoryContactStore();
  await contacts.saveContact(validContact("k1"));
  await contacts.saveRights(validRights("k1"));
  const ledger = new MemoryLedgerStore();
  await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  return { campaigns, contacts, ledger, campaign };
}
async function setIntentStatus(campaigns, ledger, intentId, status) {
  const intents = await campaigns.listIntentsByCampaign("t1", "c1");
  const intent = { ...intents.find((i) => i.intentId === intentId), status };
  await campaigns.saveIntent(intent);
}

test("advances enrollment after provider_accepted; planner then drafts the follow-up", async () => {
  const { campaigns, contacts, ledger } = await setup(1);
  const [step1] = await campaigns.listIntentsByCampaign("t1", "c1");
  assert.equal(step1.step, 1);
  await setIntentStatus(campaigns, ledger, step1.intentId, "provider_accepted");
  const adv = await advanceEnrollments({ campaigns }, { tenantId: "t1", campaignId: "c1" });
  assert.equal(adv.advanced.length, 1);
  assert.deepEqual(adv.advanced[0], { enrollmentId: step1.enrollmentId, fromStep: 0, toStep: 1 });
  const res = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.planned.length, 1);
  assert.equal(res.planned[0].step, 2);
});

test("completes enrollment when the final step is accepted", async () => {
  const { campaigns, ledger } = await setup(0); // no follow-ups: step 1 is final
  const [step1] = await campaigns.listIntentsByCampaign("t1", "c1");
  await setIntentStatus(campaigns, ledger, step1.intentId, "provider_accepted");
  const adv = await advanceEnrollments({ campaigns }, { tenantId: "t1", campaignId: "c1" });
  assert.equal(adv.completed.length, 1);
  const [enr] = await campaigns.listEnrollments("t1", "c1");
  assert.equal(enr.status, "completed");
});

test("ends enrollment on provider_rejected; never advances on provider_unknown", async () => {
  const { campaigns, ledger } = await setup(1);
  const [step1] = await campaigns.listIntentsByCampaign("t1", "c1");
  await setIntentStatus(campaigns, ledger, step1.intentId, "provider_rejected");
  const adv = await advanceEnrollments({ campaigns }, { tenantId: "t1", campaignId: "c1" });
  assert.equal(adv.ended.length, 1);
  const [enr] = await campaigns.listEnrollments("t1", "c1");
  assert.equal(enr.status, "completed");

  const s2 = await setup(1);
  const [i2] = await s2.campaigns.listIntentsByCampaign("t1", "c1");
  await setIntentStatus(s2.campaigns, s2.ledger, i2.intentId, "provider_unknown");
  const adv2 = await advanceEnrollments({ campaigns: s2.campaigns }, { tenantId: "t1", campaignId: "c1" });
  assert.equal(adv2.advanced.length, 0);
  assert.equal(adv2.ended.length, 0);
  const [enr2] = await s2.campaigns.listEnrollments("t1", "c1");
  assert.equal(enr2.status, "active");
  assert.equal(enr2.currentStep, 0);
});

test("in-flight and replied enrollments are untouched", async () => {
  const { campaigns, ledger } = await setup(1);
  const [step1] = await campaigns.listIntentsByCampaign("t1", "c1");
  const adv = await advanceEnrollments({ campaigns }, { tenantId: "t1", campaignId: "c1" });
  assert.equal(adv.advanced.length, 0); // still drafted
  const [enr] = await campaigns.listEnrollments("t1", "c1");
  await campaigns.saveEnrollment({ ...enr, status: "replied" });
  await setIntentStatus(campaigns, ledger, step1.intentId, "provider_accepted");
  const adv2 = await advanceEnrollments({ campaigns }, { tenantId: "t1", campaignId: "c1" });
  assert.equal(adv2.advanced.length, 0); // replied enrollments never advance
});
