import { test } from "node:test";
import assert from "node:assert/strict";

const { assignBucket, decideAssignment, validateExperiment, experimentSummary, MemoryExperimentStore } = await import("../src/lib/outbound/experiments.ts");

const experiment = (overrides = {}) => ({
  tenantId: "t1", experimentId: "exp_1", campaignId: "c1", campaignVersion: 1,
  variants: [
    { key: "a", templates: [{ step: 1, subject: "A {{first_name}}", body: "Body A {{full_name}}" }] },
    { key: "b", templates: [{ step: 1, subject: "B {{first_name}}", body: "Body B {{full_name}}" }] },
  ],
  holdoutPercent: 20,
  status: "active",
  variantsApprovedBy: "approver1",
  createdAt: "2026-10-28T00:00:00Z", createdBy: "u1",
  ...overrides,
});

test("assignment is deterministic and contacts never cross variants", () => {
  const e = experiment();
  const first = decideAssignment(e, "ct_100");
  for (let i = 0; i < 50; i++) assert.deepEqual(decideAssignment(e, "ct_100"), first);
  assert.equal(assignBucket("t1", "ct_100", "exp_1"), assignBucket("t1", "ct_100", "exp_1"));
  // holdout buckets are below holdoutPercent
  const holdouts = Array.from({ length: 500 }, (_, i) => decideAssignment(e, `ct_${i}`)).filter((a) => a.kind === "holdout").length;
  assert.ok(holdouts > 40 && holdouts < 160, `holdout rate roughly 20%, got ${holdouts}`);
  const variants = new Set(Array.from({ length: 500 }, (_, i) => decideAssignment(e, `ct_${i}`)).filter((a) => a.kind === "variant").map((a) => a.key));
  assert.deepEqual([...variants].sort(), ["a", "b"]);
});

test("validation requires approved variants before activation", () => {
  assert.deepEqual(validateExperiment(experiment()), []);
  assert.ok(validateExperiment(experiment({ variantsApprovedBy: null })).includes("variants_not_approved"));
  assert.ok(validateExperiment(experiment({ variants: [] })).includes("no_variants"));
  assert.ok(validateExperiment(experiment({ holdoutPercent: 101 })).includes("invalid_holdout_percent"));
  assert.ok(validateExperiment(experiment({ variantsApprovedBy: null, status: "draft" })).length === 0); // draft may be unapproved
});

test("summary labels small samples explicitly", () => {
  const s = experimentSummary(experiment(), { variant: { a: 30, b: 25 }, holdout: 12 });
  assert.equal(s.totalSample, 67);
  assert.equal(s.smallSample, true);
});

test("planner skips holdouts and tags variants", async () => {
  const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
  const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
  const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
  const NOW = new Date("2026-10-27T12:00:00Z");
  const campaigns = new MemoryCampaignStore();
  const ledger = new MemoryLedgerStore();
  const contacts = new MemoryContactStore();
  const experiments = new MemoryExperimentStore();
  const spec = {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["snd_1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 2, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 100 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2027-01-01T00:00:00Z",
  };
  const campaign = { ...spec, tenantId: "t1", createdAt: NOW.toISOString(), createdBy: "u1" };
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, { tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW });
  await experiments.saveExperiment(experiment());
  const exp = await experiments.getActiveExperiment("t1", "c1", 1);
  // enroll enough contacts to hit both holdout and variants
  for (let i = 0; i < 30; i++) {
    const cid = `ct_${i}`;
    await contacts.saveContact({
      tenantId: "t1", contactId: cid, accountId: "a1", email: `c${i}@x.co`, fullName: `Contact ${i}`,
      verification: { state: "valid", verifiedAt: NOW.toISOString(), verifier: "test" },
      employerChangedAt: null, createdAt: NOW.toISOString(), createdBy: "u1",
    });
    await contacts.saveRights({
      tenantId: "t1", rightsId: `rr_${i}`, contactId: cid, sourceEvidenceId: "ev1",
      intendedUse: "b2b_marketing", licensePermitsUse: true, subscriberClass: "corporate",
      lawfulBasis: "test", country: "US", createdAt: NOW.toISOString(), createdBy: "u1",
    });
    await enrollContact(campaigns, { tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: cid, exclusionGroup: `g${i}`, actor: "u1", now: NOW });
  }
  const result = await planCampaignIntents({ campaigns, ledger, contacts, experiments }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  const holdouts = result.skipped.filter((s) => s.reasons.includes("experiment_holdout"));
  assert.ok(holdouts.length > 0, "some contacts held out");
  assert.equal(result.blocked.length, 0);
  assert.ok(result.planned.length > 0);
  assert.ok(result.planned.every((i) => i.experimentVariant === "a" || i.experimentVariant === "b"));
  // deterministic: same assignment per contact
  for (const i of result.planned) {
    const a = decideAssignment(exp, i.contactId);
    assert.equal(a.kind, "variant");
    assert.equal(a.key, i.experimentVariant);
  }
});
