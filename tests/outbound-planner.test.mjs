import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");

const NOW = new Date("2026-10-27T12:00:00Z");
const ISO = NOW.toISOString();

function campaignSpec() {
  return {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["s1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi", body: "Body" }],
    allowedPersonalization: [], followUpCount: 2, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25,
    costCeiling: { currency: "USD", amount: 10000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00Z", createdAt: ISO, createdBy: "u1",
  };
}
function validContact(contactId) {
  return {
    tenantId: "t1", contactId, accountId: "a1", email: `${contactId}@corp.example`,
    fullName: "Person", verification: { state: "valid", verifiedAt: ISO, verifier: "test" },
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
async function approvedStore() {
  const campaigns = new MemoryCampaignStore();
  const campaign = campaignSpec();
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, {
    tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW,
  });
  return { campaigns, campaign, approval };
}

test("plans a drafted intent for an eligible active enrollment", async () => {
  const { campaigns, campaign, approval } = await approvedStore();
  await enrollContact(campaigns, {
    tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k1",
    exclusionGroup: "k1", actor: "u1", now: NOW,
  });
  const contacts = new MemoryContactStore();
  await contacts.saveContact(validContact("k1"));
  await contacts.saveRights(validRights("k1"));
  const ledger = new MemoryLedgerStore();
  const res = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.planned.length, 1);
  assert.equal(res.planned[0].status, "drafted");
  assert.equal(res.planned[0].step, 1);
  // idempotent: second run plans nothing new
  const res2 = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res2.planned.length, 0);
});

test("fail-closed skips: unverified contact, missing rights, suppressed contact", async () => {
  const { campaigns, campaign, approval } = await approvedStore();
  const contacts = new MemoryContactStore();
  const ledger = new MemoryLedgerStore();
  for (const cid of ["bad1", "bad2", "bad3"]) {
    await enrollContact(campaigns, {
      tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: cid,
      exclusionGroup: cid, actor: "u1", now: NOW,
    });
  }
  const c1 = validContact("bad1"); c1.verification = { state: "unknown", verifiedAt: null, verifier: null };
  await contacts.saveContact(c1);
  await contacts.saveRights(validRights("bad1"));
  await contacts.saveContact(validContact("bad2")); // no rights
  await contacts.saveContact(validContact("bad3"));
  await contacts.saveRights(validRights("bad3"));
  const { addSuppression } = await import("../src/lib/outbound/campaign.ts");
  await addSuppression(campaigns, { tenantId: "t1", email: "bad3@corp.example", reason: "opt_out", source: "test", actor: "u1", now: NOW });
  const res = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.planned.length, 0);
  assert.equal(res.skipped.length, 3);
  assert.ok(res.skipped[0].reasons.includes("verification_unknown"));
  assert.ok(res.skipped[1].reasons.includes("rights_record_missing"));
  assert.ok(res.skipped[2].reasons.includes("contact_suppressed"));
});

test("no planning without approval or after expiry", async () => {
  const campaigns = new MemoryCampaignStore();
  const campaign = campaignSpec();
  await campaigns.saveCampaignVersion(campaign); // no approval
  const contacts = new MemoryContactStore();
  const ledger = new MemoryLedgerStore();
  const res = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.deepEqual(res.blocked, ["approval_missing_or_revoked"]);
  const res2 = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: new Date("2027-01-01T00:00:00Z") });
  assert.deepEqual(res2.blocked, ["approval_missing_or_revoked"]); // approval still missing first
});

test("cross-tenant planning sees nothing", async () => {
  const { campaigns } = await approvedStore();
  const contacts = new MemoryContactStore();
  const ledger = new MemoryLedgerStore();
  const res = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t2", campaignId: "c1", actor: "u1", now: NOW });
  assert.deepEqual(res.blocked, ["campaign_version_missing"]);
  assert.equal(res.planned.length, 0);
});
