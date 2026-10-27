import { test } from "node:test";
import assert from "node:assert/strict";

const { planRetentionSweep, executeRetentionSweep, LEGAL_HOLD_BASIS } = await import("../src/lib/outbound/retention.ts");
const { MemoryContactStore } = await import("../src/lib/outbound/planner.ts");
const { MemoryCampaignStore } = await import("../src/lib/outbound/campaign.ts");
const { MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");
const { MemoryAuditStore, auditEvent } = await import("../src/lib/outbound/audit.ts");
const { MemoryEvidenceStore } = await import("../src/lib/outbound/rtdb-import-store.ts");

const NOW = new Date("2026-10-28T00:00:00Z");
const OLD = "2026-01-01T00:00:00Z"; // ~300 days before NOW: past the 90d proposal
const RECENT = "2026-10-01T00:00:00Z";
const ANCIENT = "2024-01-01T00:00:00Z"; // past the 365d audit proposal

function contact(contactId, createdAt) {
  return {
    tenantId: "t1", contactId, accountId: "acc_1", email: `${contactId}@example.com`,
    fullName: "Test", verification: { state: "verified", verifiedAt: createdAt, verifier: "csv" },
    employerChangedAt: null, createdAt, createdBy: "import",
  };
}

function rights(contactId, lawfulBasis = "legitimate_interest") {
  return {
    tenantId: "t1", rightsId: `r_${contactId}`, contactId, sourceEvidenceId: `ev_${contactId}`,
    intendedUse: "b2b_marketing", licensePermitsUse: true, subscriberClass: "corporate",
    lawfulBasis, country: "US", createdAt: OLD, createdBy: "import",
  };
}

function evidence(evidenceId, contactId, createdAt) {
  return {
    tenantId: "t1", evidenceId, contactId, kind: "csv_import", sourceLabel: "test.csv",
    termsAcknowledgedAt: createdAt, createdAt, createdBy: "import",
  };
}

async function buildStores() {
  const contacts = new MemoryContactStore();
  const campaigns = new MemoryCampaignStore();
  const conversations = new MemoryConversationStore();
  const audit = new MemoryAuditStore();
  const evidenceStore = new MemoryEvidenceStore();
  return { contacts, campaigns, conversations, audit, evidence: evidenceStore };
}

test("old unprotected contact is planned for deletion; recent, legal-hold, enrolled and conversed contacts are skipped", async () => {
  const stores = await buildStores();
  await stores.contacts.saveContact(contact("c_old", OLD));
  await stores.contacts.saveRights(rights("c_old"));
  await stores.contacts.saveContact(contact("c_recent", RECENT));
  await stores.contacts.saveContact(contact("c_hold", OLD));
  await stores.contacts.saveRights(rights("c_hold", LEGAL_HOLD_BASIS));
  await stores.contacts.saveContact(contact("c_conv", OLD));
  await stores.conversations.saveConversation({
    tenantId: "t1", conversationId: "cv_c_conv", contactId: "c_conv", enrollmentId: null,
    humanReplySeenAt: RECENT, classification: null, classifiedBy: null, ownerUserId: null,
    createdAt: RECENT, createdBy: "ingestion",
  });
  // evidence: one tied to the deletable contact, one to the recent contact, one account-level old
  await stores.evidence.saveEvidence(evidence("ev_c_old", "c_old", OLD));
  await stores.evidence.saveEvidence(evidence("ev_c_recent", "c_recent", OLD));
  await stores.evidence.saveEvidence(evidence("ev_acct", undefined, OLD));

  const plan = await planRetentionSweep(stores, { tenantId: "t1", now: NOW });
  assert.deepEqual(plan.deleteContacts.map((c) => c.contactId), ["c_old"]);
  const skips = Object.fromEntries(plan.skipContacts.map((s) => [s.contactId, s.reason]));
  assert.equal(skips.c_recent, "recent");
  assert.equal(skips.c_hold, "legal_hold");
  assert.equal(skips.c_conv, "conversation_exists");
  // evidence follows its contact: only the deletable contact's + account-level old evidence
  assert.deepEqual(plan.deleteEvidence.map((e) => e.evidenceId).sort(), ["ev_acct", "ev_c_old"]);
});

test("active enrollment protects the contact; completed enrollment does not", async () => {
  const stores = await buildStores();
  await stores.contacts.saveContact(contact("c_active", OLD));
  await stores.contacts.saveContact(contact("c_done", OLD));
  // fabricate campaign + enrollments directly in the memory store
  stores.campaigns.versions.set("t1:camp1:1", {
    tenantId: "t1", campaignId: "camp1", version: 1, name: "c", status: "active",
    steps: [], holdoutPercent: 0, createdAt: OLD, createdBy: "a", expiresAt: "2027-01-01T00:00:00Z",
  });
  stores.campaigns.enrollments.set("t1:e1", {
    tenantId: "t1", enrollmentId: "e1", campaignId: "camp1", campaignVersion: 1,
    contactId: "c_active", exclusionGroup: "g1", status: "active", currentStep: 0, createdAt: OLD, createdBy: "a",
  });
  stores.campaigns.enrollments.set("t1:e2", {
    tenantId: "t1", enrollmentId: "e2", campaignId: "camp1", campaignVersion: 1,
    contactId: "c_done", exclusionGroup: "g2", status: "completed", currentStep: 1, createdAt: OLD, createdBy: "a",
  });
  const plan = await planRetentionSweep(stores, { tenantId: "t1", now: NOW });
  const skips = Object.fromEntries(plan.skipContacts.map((s) => [s.contactId, s.reason]));
  assert.equal(skips.c_active, "active_enrollment");
  assert.deepEqual(plan.deleteContacts.map((c) => c.contactId), ["c_done"]);
});

test("suppressions are never deleted and are counted as untouched", async () => {
  const stores = await buildStores();
  await stores.contacts.saveContact(contact("c_old", OLD));
  stores.campaigns.suppressions.set("t1:tok", {
    tenantId: "t1", suppressionId: "sup_1", emailToken: "tok", reason: "opt_out",
    source: "api", createdAt: OLD, createdBy: "a",
  });
  const plan = await planRetentionSweep(stores, { tenantId: "t1", now: NOW });
  assert.equal(plan.suppressionsUntouched, 1);
  assert.equal(stores.campaigns.suppressions.size, 1);
});

test("audit purge targets only events older than the audit cutoff; the sweep's own audit event survives", async () => {
  const stores = await buildStores();
  await stores.audit.append(auditEvent({ tenantId: "t1", actor: "a", action: "old.thing", target: "x", outcome: "success", detail: null }));
  stores.audit.events[0].at = ANCIENT;
  await stores.audit.append(auditEvent({ tenantId: "t1", actor: "a", action: "new.thing", target: "x", outcome: "success", detail: null }));
  const plan = await planRetentionSweep(stores, { tenantId: "t1", now: NOW });
  assert.equal(plan.purgeAuditEvents, 1);
  const result = await executeRetentionSweep(stores, plan, plan.auditCutoff);
  assert.equal(result.purgedAuditEvents, 1);
  const remaining = await stores.audit.list("t1");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].action, "new.thing");
  // the purge is itself audited after execution and survives the next purge window
  await stores.audit.append(auditEvent({ tenantId: "t1", actor: "a", action: "retention.swept", target: "tenant:t1", outcome: "success", detail: "purgedAudit=1" }));
  assert.equal((await stores.audit.list("t1")).length, 2);
});

test("execute deletes contact + rights + evidence only for planned records; tenant isolation holds", async () => {
  const stores = await buildStores();
  await stores.contacts.saveContact(contact("c_old", OLD));
  await stores.contacts.saveRights(rights("c_old"));
  await stores.evidence.saveEvidence(evidence("ev_c_old", "c_old", OLD));
  // other tenant's identical-shape records
  await stores.contacts.saveContact({ ...contact("c_old", OLD), tenantId: "t2", email: "c_old@t2.example.com" });
  await stores.evidence.saveEvidence({ ...evidence("ev_c_old", "c_old", OLD), tenantId: "t2" });

  const plan = await planRetentionSweep(stores, { tenantId: "t1", now: NOW });
  const result = await executeRetentionSweep(stores, plan, plan.auditCutoff);
  assert.equal(result.deletedContacts, 1);
  assert.equal(result.deletedEvidence, 1);
  assert.equal(await stores.contacts.getContact("t1", "c_old"), null);
  assert.equal(await stores.contacts.getRightsForContact("t1", "c_old"), null);
  assert.equal((await stores.evidence.listEvidence("t1")).length, 0);
  // t2 untouched
  assert.notEqual(await stores.contacts.getContact("t2", "c_old"), null);
  assert.equal((await stores.evidence.listEvidence("t2")).length, 1);
});

test("dry-run plan alone mutates nothing", async () => {
  const stores = await buildStores();
  await stores.contacts.saveContact(contact("c_old", OLD));
  const plan = await planRetentionSweep(stores, { tenantId: "t1", now: NOW });
  assert.equal(plan.deleteContacts.length, 1);
  assert.notEqual(await stores.contacts.getContact("t1", "c_old"), null);
});
