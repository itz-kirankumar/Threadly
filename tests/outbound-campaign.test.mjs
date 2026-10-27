import { test } from "node:test";
import assert from "node:assert/strict";

const {
  addSuppression,
  isSuppressed,
  approveCampaign,
  revokeApproval,
  enrollContact,
  recordHumanReply,
  campaignVersionBump,
  MemoryCampaignStore,
  CampaignError,
} = await import("../src/lib/outbound/campaign.ts");

const NOW = new Date("2026-10-27T12:00:00.000Z");

function campaign(version = 1) {
  return {
    tenantId: "t1", campaignId: "camp1", version,
    senderAllowlist: ["snd1"], audienceQueryVersion: "aq1", exclusions: [],
    templates: [{ step: 1, subject: "s", body: "b" }], allowedPersonalization: [],
    followUpCount: 2, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 1000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00.000Z", createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

function intent(status, over = {}) {
  return {
    tenantId: "t1", intentId: over.intentId ?? "i1", uniqueKey: "k" + (over.intentId ?? "i1"),
    enrollmentId: "e1", campaignId: "camp1", campaignVersion: 1,
    contactId: "c1", senderId: "snd1", step: 1,
    status, statusUpdatedAt: NOW.toISOString(), cancelReason: null,
    leaseOwner: null, leaseExpiresAt: null, reconciledAt: null,
    createdAt: NOW.toISOString(), createdBy: "u1", ...over,
  };
}

test("suppression add is idempotent and lookup is normalized", async () => {
  const store = new MemoryCampaignStore();
  const first = await addSuppression(store, { tenantId: "t1", email: "Jane@ACME.com", reason: "opt_out", source: "link", actor: "u1", now: NOW });
  assert.equal(first.created, true);
  const second = await addSuppression(store, { tenantId: "t1", email: "jane@acme.com", reason: "manual", source: "admin", actor: "u1", now: NOW });
  assert.equal(second.created, false);
  assert.equal(await isSuppressed(store, "t1", "  JANE@acme.COM"), true);
  assert.equal(await isSuppressed(store, "t1", "other@acme.com"), false);
  // tenant isolation: same email in another tenant is not suppressed
  assert.equal(await isSuppressed(store, "t2", "jane@acme.com"), false);
});

test("approval requires approver role and no duplicate active approval", async () => {
  const store = new MemoryCampaignStore();
  await assert.rejects(
    approveCampaign(store, { tenantId: "t1", campaign: campaign(), approverUserId: "u9", approverRole: "rep", now: NOW }),
    CampaignError
  );
  const ap = await approveCampaign(store, { tenantId: "t1", campaign: campaign(), approverUserId: "u1", approverRole: "campaign_approver", now: NOW });
  assert.equal(ap.campaignVersion, 1);
  await assert.rejects(
    approveCampaign(store, { tenantId: "t1", campaign: campaign(), approverUserId: "u1", approverRole: "owner", now: NOW }),
    CampaignError
  );
});

test("revocation cancels pre-dispatch intents, reports in-flight, closes enrollments", async () => {
  const store = new MemoryCampaignStore();
  const ap = await approveCampaign(store, { tenantId: "t1", campaign: campaign(), approverUserId: "u1", approverRole: "owner", now: NOW });
  await store.saveIntent(intent("scheduled", { intentId: "i1" }));
  await store.saveIntent(intent("reserved", { intentId: "i2" }));
  await store.saveIntent(intent("provider_unknown", { intentId: "i3" }));
  await store.saveIntent(intent("provider_accepted", { intentId: "i4" }));
  await store.saveIntent(intent("dispatching", { intentId: "i5" }));
  await enrollContact(store, {
    tenantId: "t1", campaign: campaign(), approvalId: ap.approvalId, contactId: "c1",
    exclusionGroup: "acme.com", actor: "u1", now: NOW,
  });

  const res = await revokeApproval(store, { tenantId: "t1", approvalId: ap.approvalId, revokedBy: "u2", now: NOW });
  assert.equal(res.cancelledIntents, 3); // scheduled, reserved, unknown
  assert.equal(res.inFlightIntents, 2); // accepted, dispatching

  const i1 = [...store.intents.values()].find((i) => i.intentId === "i1");
  assert.equal(i1.status, "cancelled");
  assert.equal(i1.cancelReason, "approval_revoked");
  const i4 = [...store.intents.values()].find((i) => i.intentId === "i4");
  assert.equal(i4.status, "provider_accepted"); // cannot recall

  const enr = [...store.enrollments.values()][0];
  assert.equal(enr.status, "cancelled");

  await assert.rejects(
    revokeApproval(store, { tenantId: "t1", approvalId: ap.approvalId, revokedBy: "u2", now: NOW }),
    CampaignError
  );
});

test("enrollment guards: revoked, wrong version, expired, exclusion group clash", async () => {
  const store = new MemoryCampaignStore();
  const ap = await approveCampaign(store, { tenantId: "t1", campaign: campaign(), approverUserId: "u1", approverRole: "owner", now: NOW });

  const e1 = await enrollContact(store, {
    tenantId: "t1", campaign: campaign(), approvalId: ap.approvalId, contactId: "c1",
    exclusionGroup: "acme.com", actor: "u1", now: NOW,
  });
  assert.equal(e1.status, "active");

  // one active enrollment per exclusion group
  await assert.rejects(
    enrollContact(store, { tenantId: "t1", campaign: campaign(), approvalId: ap.approvalId, contactId: "c2", exclusionGroup: "acme.com", actor: "u1", now: NOW }),
    CampaignError
  );
  // same tenant, different exclusion group is fine
  await enrollContact(store, { tenantId: "t1", campaign: campaign(), approvalId: ap.approvalId, contactId: "c3", exclusionGroup: "other.com", actor: "u1", now: NOW });
  // different tenant, same exclusion group is fine
  const ap2 = await approveCampaign(store, { tenantId: "t2", campaign: { ...campaign(), tenantId: "t2" }, approverUserId: "u1", approverRole: "owner", now: NOW });
  await enrollContact(store, { tenantId: "t2", campaign: { ...campaign(), tenantId: "t2" }, approvalId: ap2.approvalId, contactId: "c9", exclusionGroup: "acme.com", actor: "u1", now: NOW });

  // wrong version
  await assert.rejects(
    enrollContact(store, { tenantId: "t1", campaign: campaign(2), approvalId: ap.approvalId, contactId: "c4", exclusionGroup: "x.com", actor: "u1", now: NOW }),
    CampaignError
  );
  // expired campaign
  await assert.rejects(
    enrollContact(store, { tenantId: "t1", campaign: { ...campaign(), expiresAt: "2026-10-01T00:00:00.000Z" }, approvalId: ap.approvalId, contactId: "c5", exclusionGroup: "y.com", actor: "u1", now: NOW }),
    CampaignError
  );
  // revoked approval
  await revokeApproval(store, { tenantId: "t1", approvalId: ap.approvalId, revokedBy: "u1", now: NOW });
  await assert.rejects(
    enrollContact(store, { tenantId: "t1", campaign: campaign(), approvalId: ap.approvalId, contactId: "c6", exclusionGroup: "z.com", actor: "u1", now: NOW }),
    CampaignError
  );
});

test("human reply cancels pending intents before classification and marks enrollment", async () => {
  const store = new MemoryCampaignStore();
  const ap = await approveCampaign(store, { tenantId: "t1", campaign: campaign(), approverUserId: "u1", approverRole: "owner", now: NOW });
  const e = await enrollContact(store, { tenantId: "t1", campaign: campaign(), approvalId: ap.approvalId, contactId: "c1", exclusionGroup: "acme.com", actor: "u1", now: NOW });
  await store.saveIntent(intent("scheduled", { intentId: "i1", enrollmentId: e.enrollmentId }));
  await store.saveIntent(intent("provider_accepted", { intentId: "i2", enrollmentId: e.enrollmentId }));

  const res = await recordHumanReply(store, {
    tenantId: "t1", enrollment: e,
    intents: [...store.intents.values()], actor: "system", now: NOW,
  });
  assert.equal(res.cancelledIntents, 1);
  const i1 = [...store.intents.values()].find((i) => i.intentId === "i1");
  assert.equal(i1.cancelReason, "human_reply");
  const updated = [...store.enrollments.values()][0];
  assert.equal(updated.status, "replied");
});

test("version bump requires a material change and +1 increment", () => {
  const v1 = campaign(1);
  assert.throws(() => campaignVersionBump(v1, { ...v1, version: 2 }), CampaignError);
  assert.throws(() => campaignVersionBump(v1, { ...v1, version: 3, dailyCapPerSender: 10 }), CampaignError);
  assert.doesNotThrow(() => campaignVersionBump(v1, { ...v1, version: 2, dailyCapPerSender: 10 }));
});
