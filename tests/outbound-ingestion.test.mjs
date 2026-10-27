import { test } from "node:test";
import assert from "node:assert/strict";

const { ingestProviderEvent, syncHealth, MemoryIngestionStore } = await import("../src/lib/outbound/ingestion.ts");
const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
const { MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");

const NOW = new Date("2026-10-27T12:00:00Z");

async function setup() {
  const campaigns = new MemoryCampaignStore();
  const conversations = new MemoryConversationStore();
  const ingestion = new MemoryIngestionStore();
  const contacts = new MemoryContactStore();
  const ledger = new MemoryLedgerStore();
  const campaign = {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["snd_1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 2, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 100 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2027-01-01T00:00:00Z", createdAt: NOW.toISOString(), createdBy: "u1",
  };
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, { tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW });
  await enrollContact(campaigns, { tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k1", exclusionGroup: "k1", actor: "u1", now: NOW });
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
  // conversation linked to the enrollment
  const enrollment = (await campaigns.listEnrollments("t1", "c1"))[0];
  await conversations.saveConversation({
    tenantId: "t1", conversationId: "cv_k1", contactId: "k1", enrollmentId: enrollment.enrollmentId,
    humanReplySeenAt: null, classification: null, classifiedBy: null, ownerUserId: null,
    createdAt: NOW.toISOString(), createdBy: "u1",
  });
  // plan intents so there is cancellable work
  await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  return { campaigns, conversations, ingestion, contacts, enrollment };
}

const findByEmailAdapter = (contacts) => ({ findByEmail: (t, e) => [...contacts.contacts.values()].find((c) => c.tenantId === t && c.email === e) ?? null });

test("reply event: deduped on replay, humanReplySeenAt set, intents cancelled before classification", async () => {
  const s = await setup();
  const event = {
    tenantId: "t1", eventKey: "gmail:msg1:reply", kind: "reply", senderId: "snd_1",
    contactEmail: "ada@acme.com", providerMessageId: "msg1", occurredAt: NOW.toISOString(), cursor: "cur1",
  };
  const stores = { ingestion: s.ingestion, campaigns: s.campaigns, conversations: s.conversations, contacts: findByEmailAdapter(s.contacts) };
  const first = await ingestProviderEvent(stores, event, { now: NOW });
  assert.equal(first.deduped, false);
  assert.equal(first.action, "reply_recorded");
  assert.equal(first.cancelledIntents, 1); // the planned intent cancelled
  const conv = (await s.conversations.listConversations("t1"))[0];
  assert.equal(conv.humanReplySeenAt, NOW.toISOString());
  assert.equal(conv.classification, null); // classification never precedes the human-reply marker

  const dup = await ingestProviderEvent(stores, event, { now: NOW });
  assert.equal(dup.deduped, true);
  assert.equal(dup.action, "none");

  const cursor = await s.ingestion.getCursor("t1", "snd_1");
  assert.equal(cursor.cursor, "cur1");
  assert.equal(syncHealth(cursor, NOW), "ok");
  assert.equal(syncHealth(cursor, new Date(NOW.getTime() + 6 * 60 * 1000)), "stale");
  assert.equal(syncHealth(null, NOW), "never_synced");
});

test("hard bounce and complaint create immediate suppressions", async () => {
  const s = await setup();
  const stores = { ingestion: s.ingestion, campaigns: s.campaigns, conversations: s.conversations, contacts: findByEmailAdapter(s.contacts) };
  const bounce = await ingestProviderEvent(stores, {
    tenantId: "t1", eventKey: "gmail:msg2:bounce", kind: "hard_bounce", senderId: "snd_1",
    contactEmail: "ada@acme.com", providerMessageId: "msg2", occurredAt: NOW.toISOString(), cursor: null,
  }, { now: NOW });
  assert.equal(bounce.action, "suppressed");
  const complaint = await ingestProviderEvent(stores, {
    tenantId: "t1", eventKey: "gmail:msg3:complaint", kind: "complaint", senderId: "snd_1",
    contactEmail: "ada@acme.com", providerMessageId: "msg3", occurredAt: NOW.toISOString(), cursor: null,
  }, { now: NOW });
  assert.equal(complaint.action, "suppressed");
  const { suppressionTokenFor } = await import("../src/lib/outbound/policy.ts");
  const sup = await s.campaigns.findSuppression("t1", suppressionTokenFor("t1", "ada@acme.com"));
  assert.ok(sup);
  assert.equal(sup.reason, "hard_bounce"); // first suppression wins the record
});

test("dispatch defers when sender sync is stale or never synced", async () => {
  const s = await setup();
  const { runDispatch, MockDispatchProvider } = await import("../src/lib/outbound/dispatch.ts");
  const { MemoryDraftStore } = await import("../src/lib/outbound/drafts.ts");
  const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");
  const drafts = new MemoryDraftStore();
  const usage = new MemoryUsageStore();
  const ledger = new MemoryLedgerStore();
  const senders = { getSender: async () => ({ tenantId: "t1", senderId: "snd_1", status: "active", provider: "gmail", email: "rep@acme.com", consentTraceId: "ct_1", scopes: [], dailyCap: 25, localTimezone: "UTC", createdAt: NOW.toISOString(), createdBy: "u1" }) };
  const campaigns = new MemoryCampaignStore();
  const campaign = {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["snd_1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 2, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 100 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2027-01-01T00:00:00Z", createdAt: NOW.toISOString(), createdBy: "u1",
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
  await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  const intents = await campaigns.listIntentsByCampaign("t1", "c1");
  const { transition } = await import("../src/lib/outbound/ledger.ts");
  for (const i of intents) {
    await ledger.createIntentIfAbsent(i).catch(() => {});
    const approved = transition(i, "approved", { actor: "u1", now: NOW });
    await campaigns.saveIntent(approved);
    await ledger.compareAndSetStatus("t1", i.intentId, i.status, approved);
  }
  await drafts.saveDraft({ tenantId: "t1", draftId: "dr_x", intentId: intents[0].intentId, subject: "s", body: "b", reviewState: "approved", createdAt: NOW.toISOString(), createdBy: "u1" });

  const ingestion = new MemoryIngestionStore();
  const stores = { campaigns, ledger, drafts, senders, contacts, usage, ingestion };
  // never synced: dispatch must defer
  const r1 = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(r1.dispatched.length, 0);
  assert.ok(r1.deferred.some((d) => d.reasons.includes("sender_sync_never_synced")));

  // stale cursor: still deferred
  await ingestion.saveCursor({ tenantId: "t1", senderId: "snd_1", cursor: "c1", syncedAt: new Date(NOW.getTime() - 6 * 60 * 1000).toISOString() });
  const r2 = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.ok(r2.deferred.some((d) => d.reasons.includes("sender_sync_stale")));

  // fresh cursor: dispatch proceeds (mock: synthetic only)
  await ingestion.saveCursor({ tenantId: "t1", senderId: "snd_1", cursor: "c2", syncedAt: NOW.toISOString() });
  const r3 = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(r3.dispatched.length, 1);
});

test("webhook verification: constant-time secret compare, gmail push parsing, graph clientState fail-closed", async () => {
  const { secretMatches, parseGmailPush, parseGraphNotifications } = await import("../src/lib/outbound/webhooks.ts");
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abc", "abd"), false);
  assert.equal(secretMatches("abc", "abcd"), false);
  assert.equal(secretMatches("", "abc"), false);

  const good = { message: { data: Buffer.from(JSON.stringify({ emailAddress: "rep@acme.com", historyId: 12345 })).toString("base64url") } };
  assert.deepEqual(parseGmailPush(good), { emailAddress: "rep@acme.com", historyId: "12345" });
  assert.equal(parseGmailPush({ message: {} }), null);
  assert.equal(parseGmailPush({ message: { data: "!!!notbase64json" } }), null);
  assert.equal(parseGmailPush(null), null);
  assert.equal(parseGmailPush({ message: { data: Buffer.from('{"historyId":1}').toString("base64url") } }), null);

  const body = { value: [
    { subscriptionId: "s1", clientState: "secret1", resource: "users/u1/messages/m1", changeType: "created" },
    { subscriptionId: "s1", clientState: "secret1", resource: "users/u1/messages/m2", changeType: "created" },
  ]};
  assert.deepEqual(parseGraphNotifications(body, "secret1"), ["users/u1/messages/m1", "users/u1/messages/m2"]);
  // any entry with a wrong clientState voids the whole batch (fail closed)
  const mixed = { value: [body.value[0], { ...body.value[1], clientState: "wrong" }] };
  assert.equal(parseGraphNotifications(mixed, "secret1"), null);
  assert.equal(parseGraphNotifications({ value: [] }, "secret1"), null);
  assert.equal(parseGraphNotifications({}, "secret1"), null);
});
