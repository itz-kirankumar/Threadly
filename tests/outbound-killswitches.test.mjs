import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryKillSwitchStore, engageKillSwitch, activeKillSwitches, killSwitchReasons } = await import("../src/lib/outbound/kill-switches.ts");
const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { runDispatch, MockDispatchProvider } = await import("../src/lib/outbound/dispatch.ts");
const { MemoryDraftStore } = await import("../src/lib/outbound/drafts.ts");
const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");
const { MemoryIngestionStore } = await import("../src/lib/outbound/ingestion.ts");
const { checkDispatch } = await import("../src/lib/outbound/policy.ts");

const NOW = new Date("2026-10-28T12:00:00Z");

function sw(over = {}) {
  return {
    tenantId: "t1", switchId: "ks_1", scope: "campaign", target: "camp1",
    reason: "deliverability investigation", createdAt: NOW.toISOString(), createdBy: "admin1", liftedAt: null, ...over,
  };
}

test("engage is one-active-per-scope+target; lift keeps the record; re-engage creates new", async () => {
  const store = new MemoryKillSwitchStore();
  const first = await engageKillSwitch(store, sw());
  assert.equal(first.created, true);
  const dupe = await engageKillSwitch(store, sw());
  assert.equal(dupe.created, false);
  assert.equal(dupe.switch.switchId, first.switch.switchId);
  await store.lift("t1", first.switch.switchId, NOW.toISOString());
  const again = await engageKillSwitch(store, sw());
  assert.equal(again.created, true);
  assert.notEqual(again.switch.switchId, first.switch.switchId);
  assert.equal((await store.list("t1")).length, 2); // lifted record retained
});

test("matching: tenant always, campaign/sender/domain by target, lifted never", () => {
  const switches = [
    sw({ switchId: "a", scope: "tenant", target: "*" }),
    sw({ switchId: "b", scope: "campaign", target: "camp1" }),
    sw({ switchId: "c", scope: "campaign", target: "other" }),
    sw({ switchId: "d", scope: "sender", target: "snd_1" }),
    sw({ switchId: "e", scope: "domain", target: "example.com" }),
    sw({ switchId: "f", scope: "tenant", target: "*", liftedAt: NOW.toISOString() }),
  ];
  const m1 = activeKillSwitches(switches, { campaignId: "camp1", senderId: "snd_1", senderDomain: "example.com" });
  assert.deepEqual(m1.map((s) => s.switchId).sort(), ["a", "b", "d", "e"]);
  const m2 = activeKillSwitches(switches, { campaignId: "nope", senderId: "nope", senderDomain: "nope.org" });
  assert.deepEqual(m2.map((s) => s.switchId), ["a"]);
  const m3 = activeKillSwitches(switches, {});
  assert.deepEqual(m3.map((s) => s.switchId), ["a"]);
  assert.deepEqual(killSwitchReasons([switches[1]]), ["kill_switch_campaign:deliverability investigation"]);
});

async function plannableSetup(senderEmail = "rep@example.com") {
  const campaigns = new MemoryCampaignStore();
  const ledger = new MemoryLedgerStore();
  const contacts = new MemoryContactStore();
  const killSwitches = new MemoryKillSwitchStore();
  const campaign = {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["snd_1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 0, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25,
    costCeiling: { currency: "USD", amount: 10000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00Z", createdAt: NOW.toISOString(), createdBy: "u1",
  };
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, { tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW });
  await enrollContact(campaigns, { tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k1", exclusionGroup: "k1", actor: "u1", now: NOW });
  await contacts.saveContact({
    tenantId: "t1", contactId: "k1", accountId: "a1", email: "k1@corp.example",
    fullName: "Ada Lovelace", verification: { state: "valid", verifiedAt: NOW.toISOString(), verifier: "test" },
    employerChangedAt: null, createdAt: NOW.toISOString(), createdBy: "u1",
  });
  await contacts.saveRights({
    tenantId: "t1", rightsId: "r-k1", contactId: "k1", sourceEvidenceId: "e1",
    intendedUse: "b2b_marketing", licensePermitsUse: true, subscriberClass: "corporate",
    lawfulBasis: "legitimate_interest", country: "US", createdAt: NOW.toISOString(), createdBy: "u1",
  });
  return { campaigns, ledger, contacts, killSwitches, senderEmail };
}

test("campaign-scope switch blocks planning with a visible reason; lifted switch plans normally", async () => {
  const stores = await plannableSetup();
  await stores.killSwitches.save(sw({ target: "c1" }));
  const blocked = await planCampaignIntents(stores, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(blocked.planned.length, 0);
  assert.deepEqual(blocked.blocked, ["kill_switch_campaign:deliverability investigation"]);
  await stores.killSwitches.lift("t1", "ks_1", NOW.toISOString());
  const open = await planCampaignIntents(stores, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(open.planned.length, 1);
});

test("sender/domain scopes are enforced at dispatch (not planning)", async () => {
  const stores = await plannableSetup();
  // domain switch only: planning still proceeds (sender not final at plan time)
  await stores.killSwitches.save(sw({ switchId: "ks_d", scope: "domain", target: "example.com", reason: "domain warming pause" }));
  const planned = await planCampaignIntents(stores, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(planned.planned.length, 1);

  // draft + approve, then dispatch with an active sender on that domain
  const { generateDrafts, approveDraft } = await import("../src/lib/outbound/draft-run.ts");
  const drafts = new MemoryDraftStore();
  const usage = new MemoryUsageStore();
  await generateDrafts({ campaigns: stores.campaigns, ledger: stores.ledger, contacts: stores.contacts, drafts, usage }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  const draft = (await drafts.listDrafts("t1"))[0];
  await approveDraft({ ledger: stores.ledger, campaigns: stores.campaigns, drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const senders = { async getSender() {
    return {
      tenantId: "t1", senderId: "snd_1", provider: "gmail", email: "rep@example.com", status: "active",
      consentTraceId: "trace-1", scopes: [], dailyCap: 25, localTimezone: "UTC",
      createdAt: NOW.toISOString(), createdBy: "u1",
    };
  } };
  const ingestion = new MemoryIngestionStore();
  await ingestion.saveCursor({ tenantId: "t1", senderId: "snd_1", cursor: "c1", syncedAt: NOW.toISOString() });
  const result = await runDispatch(
    { campaigns: stores.campaigns, ledger: stores.ledger, drafts, senders, contacts: stores.contacts, usage, ingestion, killSwitches: stores.killSwitches },
    new MockDispatchProvider(),
    { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW },
  );
  assert.equal(result.dispatched.length, 0);
  assert.equal(result.deferred.length, 1);
  assert.ok(result.deferred[0].reasons.some((r) => r.startsWith("kill_switch_domain:domain warming pause")));
  // nothing reached the provider: no attempts recorded
  const planned2 = await stores.campaigns.listIntentsByCampaign("t1", "c1");
  assert.equal((await stores.ledger.listAttempts("t1", planned2[0].intentId)).length, 0);
});

test("checkDispatch itself treats kill reasons as blocking", () => {
  const d = checkDispatch({
    intent: { status: "reserved" }, campaign: null, approval: null, sender: null,
    contactSuppressed: false, enrollmentStatus: "active", humanReplySeen: false,
    senderAcceptedToday: 0, tenantCostToDate: 0, tenantCostComplete: true,
    killSwitchReasons: ["kill_switch_tenant:full stop"], now: NOW,
  });
  assert.equal(d.allow, false);
  assert.ok(d.reasons.includes("kill_switch_tenant:full stop"));
});

test("runDispatch refuses to run without the kill-switch store (runtime fail-closed)", async () => {
  const stores = await plannableSetup();
  const drafts = new MemoryDraftStore();
  const senders = { async getSender() { return null; } };
  await assert.rejects(
    () => runDispatch(
      { campaigns: stores.campaigns, ledger: stores.ledger, drafts, senders, contacts: stores.contacts, usage: new MemoryUsageStore() },
      new MockDispatchProvider(),
      { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW },
    ),
    /kill switch store required/,
  );
});
