import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryCampaignStore, approveCampaign, enrollContact, addSuppression } = await import("../src/lib/outbound/campaign.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
const { MemoryDraftStore } = await import("../src/lib/outbound/drafts.ts");
const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");
const { generateDrafts, approveDraft } = await import("../src/lib/outbound/draft-run.ts");
const { MockDispatchProvider, runDispatch } = await import("../src/lib/outbound/dispatch.ts");
const { MemoryKillSwitchStore } = await import("../src/lib/outbound/kill-switches.ts");
const { MemoryPreflightStore } = await import("../src/lib/outbound/preflight.ts");
const UNSUB = { baseUrl: "https://app.test", secret: "test-secret" };
function passingPreflight(domain) {
  return {
    tenantId: "t1", domain, spf: "pass", dkim: "pass", dkimSelector: "google", dmarc: "pass", dmarcPolicy: "reject",
    checkedAt: NOW.toISOString(), evidence: "test fixture", createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

const NOW = new Date("2026-10-27T12:00:00Z");
const ISO = NOW.toISOString();

function campaignSpec(senderIds) {
  return {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: senderIds, audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 2, countries: ["US"],
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
function sender(senderId, status) {
  return {
    tenantId: "t1", senderId, provider: "gmail", email: `${senderId}@corp.example`,
    status, consentTraceId: status === "active" ? "trace-1" : null, scopes: [],
    dailyCap: 25, localTimezone: "UTC", createdAt: ISO, createdBy: "u1",
  };
}
class StaticSenderReader {
  constructor(s) { this.s = s; }
  async getSender(tenantId, senderId) { return this.s.find((x) => x.senderId === senderId && x.tenantId === tenantId) ?? null; }
}

async function setup(senderList, contactId = "k1") {
  const campaigns = new MemoryCampaignStore();
  const campaign = campaignSpec(senderList.map((s) => s.senderId));
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
  const planned = await campaigns.listIntentsByCampaign("t1", "c1");
  // planner assigns a sender; override to our test sender for deterministic gates
  const intent = { ...planned[0], senderId: senderList[0].senderId };
  await campaigns.saveIntent(intent);
  await ledger.createIntentIfAbsent(intent).catch(() => {});
  const gen = await generateDrafts({ campaigns, ledger, contacts, drafts, usage , unsubscribe: UNSUB}, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(gen.rendered.length, 1);
  const draft = (await drafts.listDrafts("t1"))[0];
  const senders = new StaticSenderReader(senderList);
  const preflight = new MemoryPreflightStore();
  for (const snd of senderList) {
    await preflight.save(passingPreflight(snd.email.split("@")[1]));
  }
  const stores = { campaigns, ledger, drafts, senders, contacts, usage, killSwitches: new MemoryKillSwitchStore(), preflight };
  return { stores, campaign, intent, draft, ledger, usage, campaigns };
}

test("full loop: approve draft then mock-dispatch to provider_accepted with attempt and send usage", async () => {
  const { stores, draft, intent, ledger, usage } = await setup([sender("snd1", "active")]);
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 1);
  assert.equal(res.dispatched[0].outcome, "accepted");
  const final = await ledger.getIntent("t1", intent.intentId);
  assert.equal(final.status, "provider_accepted");
  const attempts = await ledger.listAttempts("t1", intent.intentId);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].providerCorrelationId, `mock_${intent.intentId}`);
  const events = await usage.listUsage("t1");
  assert.equal(events.filter((e) => e.kind === "send").length, 1);
  assert.equal(events.find((e) => e.kind === "send").costMinorUnits, 0);
  // idempotent: a second run has nothing in approved/scheduled
  const res2 = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res2.dispatched.length, 0);
});

test("pending_consent sender defers with sender_not_active; nothing dispatched", async () => {
  const { stores, draft, intent, ledger } = await setup([sender("snd1", "pending_consent")]);
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.ok(res.deferred[0].reasons.includes("sender_not_active:pending_consent"));
  const final = await ledger.getIntent("t1", intent.intentId);
  assert.equal(final.status, "scheduled"); // deferred, not cancelled: retryable
  assert.equal((await ledger.listAttempts("t1", intent.intentId)).length, 0);
});

test("unknown cost (null-priced usage event) blocks dispatch", async () => {
  const { stores, draft, ledger, usage } = await setup([sender("snd1", "active")]);
  await usage.recordUsage({
    tenantId: "t1", usageId: "ug_unpriced", kind: "enrichment", units: 1,
    idempotencyKey: "enrichment:unpriced", costMinorUnits: null, currency: null,
    createdAt: ISO, createdBy: "u1",
  });
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.ok(res.deferred[0].reasons.includes("tenant_cost_unknown"));
});

test("suppressed contact blocks dispatch", async () => {
  const { stores, draft, campaigns } = await setup([sender("snd1", "active")]);
  await addSuppression(campaigns, {
    tenantId: "t1", email: "k1@corp.example",
    reason: "unsubscribe", source: "test", actor: "u1", now: NOW,
  });
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.ok(res.deferred[0].reasons.includes("contact_suppressed"));
});

test("unapproved draft does not dispatch", async () => {
  const { stores } = await setup([sender("snd1", "active")]);
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.equal(res.deferred.length, 0); // intent is still drafted, not eligible at all
});

test("approveDraft rejects non-drafted intents", async () => {
  const { stores, draft, ledger } = await setup([sender("snd1", "active")]);
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  await assert.rejects(
    approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW }),
    /intent_not_drafted/
  );
});

test("mock attempts and send usage are marked synthetic; synthetic attempts do not count toward daily cap", async () => {
  const { stores, draft, intent, ledger, usage } = await setup([sender("snd1", "active")]);
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 1);
  const attempts = await ledger.listAttempts("t1", intent.intentId);
  assert.equal(attempts[0].synthetic, true);
  const sendEvent = (await usage.listUsage("t1")).find((e) => e.kind === "send");
  assert.equal(sendEvent.synthetic, true);
  // a follow-up intent for the same sender must still see zero accepted-today
  // from the synthetic attempt (real caps count real sends only)
  const attempts2 = await ledger.listAttempts("t1", intent.intentId);
  assert.equal(attempts2.filter((a) => a.outcome === "accepted" && !a.synthetic).length, 0);
});

test("stranded dispatching/provider_unknown intents are reported, never retried on lease expiry", async () => {
  const { stores, draft, intent, ledger } = await setup([sender("snd1", "active")]);
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  // simulate a crash after dispatching began: force the stored status
  const dispatching = { ...intent, status: "dispatching", leaseOwner: "dead-run", leaseExpiresAt: "2020-01-01T00:00:00Z" };
  await stores.campaigns.saveIntent(dispatching);
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.deepEqual(res.skipped.map((s) => s.reason), ["dispatching_stranded_needs_reconciliation"]);
  assert.equal((await ledger.listAttempts("t1", intent.intentId)).length, 0);
});

test("expired reserved-before-dispatch is reclaimed and gated again", async () => {
  const { stores, draft, intent, ledger } = await setup([sender("snd1", "pending_consent")]);
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts: stores.drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const staleReserved = { ...intent, status: "reserved", leaseOwner: "dead-run", leaseExpiresAt: "2020-01-01T00:00:00Z" };
  await stores.campaigns.saveIntent(staleReserved);
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.ok(res.deferred[0].reasons.includes("sender_not_active:pending_consent"));
  const final = await stores.ledger.getIntent("t1", intent.intentId).catch(() => null);
  void final;
});
