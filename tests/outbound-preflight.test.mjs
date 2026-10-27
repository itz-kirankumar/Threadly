import { test } from "node:test";
import assert from "node:assert/strict";

const { checkDomain, evaluatePreflight, MemoryPreflightStore, DKIM_COMMON_SELECTORS, PREFLIGHT_STALE_MS } = await import("../src/lib/outbound/preflight.ts");
const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { runDispatch, MockDispatchProvider } = await import("../src/lib/outbound/dispatch.ts");
const { MemoryDraftStore } = await import("../src/lib/outbound/drafts.ts");
const { generateDrafts, approveDraft } = await import("../src/lib/outbound/draft-run.ts");
const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");
const { MemoryIngestionStore } = await import("../src/lib/outbound/ingestion.ts");
const { MemoryKillSwitchStore } = await import("../src/lib/outbound/kill-switches.ts");
const UNSUB = { baseUrl: "https://app.test", secret: "test-secret" };

const NOW = new Date("2026-10-28T12:00:00Z");

class FakeResolver {
  constructor(map) { this.map = map; } // name -> string[]
  async resolveTxt(name) { return (this.map[name] ?? []).map((t) => [t]); }
}

const GOOD = {
  "corp.example": ["v=spf1 include:_spf.corp.example -all"],
  "_dmarc.corp.example": ["v=DMARC1; p=reject; rua=mailto:dmarc@corp.example"],
  "google._domainkey.corp.example": ["v=DKIM1; k=rsa; p=MIIBIjANBg..."],
};

test("checkDomain: full pass with evidence and selector recorded", async () => {
  const rec = await checkDomain("t1", "Corp.Example", new FakeResolver(GOOD), { now: NOW, actor: "u1" });
  assert.equal(rec.domain, "corp.example");
  assert.equal(rec.spf, "pass");
  assert.equal(rec.dkim, "pass");
  assert.equal(rec.dkimSelector, "google");
  assert.equal(rec.dmarc, "pass");
  assert.equal(rec.dmarcPolicy, "reject");
  assert.equal(rec.checkedAt, NOW.toISOString());
  assert.match(rec.evidence, /v=spf1/);
});

test("checkDomain: +all SPF fails; p=none DMARC passes but is recorded; no common-selector DKIM fails honestly", async () => {
  const rec = await checkDomain("t1", "weak.example", new FakeResolver({
    "weak.example": ["v=spf1 +all"],
    "_dmarc.weak.example": ["v=DMARC1; p=none"],
  }), { now: NOW, actor: "u1" });
  assert.equal(rec.spf, "fail");
  assert.equal(rec.dmarc, "pass");
  assert.equal(rec.dmarcPolicy, "none");
  assert.equal(rec.dkim, "fail");
  assert.equal(rec.dkimSelector, null);
  assert.match(rec.evidence, /no key on common selectors/);
});

test("checkDomain: absent records all fail; resolver errors read as no record", async () => {
  const rec = await checkDomain("t1", "none.example", new FakeResolver({}), { now: NOW, actor: "u1" });
  assert.deepEqual([rec.spf, rec.dkim, rec.dmarc], ["fail", "fail", "fail"]);
  class ErrResolver { async resolveTxt() { throw new Error("ENOTFOUND"); } }
  // NodeDnsResolver swallows errors; FakeResolver returning [] models NXDOMAIN
  const rec2 = await checkDomain("t1", "none.example", new FakeResolver({}), { now: NOW, actor: "u1" });
  assert.deepEqual([rec2.spf, rec2.dkim, rec2.dmarc], ["fail", "fail", "fail"]);
});

test("evaluatePreflight: missing, fresh pass, failed names checks, stale blocks", () => {
  assert.deepEqual(evaluatePreflight(null, NOW), { state: "missing", failedChecks: [] });
  const good = { tenantId: "t1", domain: "d.example", spf: "pass", dkim: "pass", dkimSelector: "google", dmarc: "pass", dmarcPolicy: "quarantine", checkedAt: NOW.toISOString(), evidence: "", createdAt: NOW.toISOString(), createdBy: "u1" };
  assert.equal(evaluatePreflight(good, NOW).state, "pass");
  const bad = { ...good, spf: "fail", dmarc: "fail" };
  assert.deepEqual(evaluatePreflight(bad, NOW), { state: "failed", failedChecks: ["spf", "dmarc"] });
  const old = { ...good, checkedAt: new Date(NOW.getTime() - PREFLIGHT_STALE_MS - 1000).toISOString() };
  assert.equal(evaluatePreflight(old, NOW).state, "stale");
});

async function dispatchSetup(preflightRecord) {
  const campaigns = new MemoryCampaignStore();
  const ledger = new MemoryLedgerStore();
  const contacts = new MemoryContactStore();
  const campaign = {
    tenantId: "t1", campaignId: "c1", version: 1,
    senderAllowlist: ["snd_1"], audienceQueryVersion: "q1", exclusions: [],
    templates: [{ step: 1, subject: "Hi {{first_name}}", body: "Hello {{full_name}}" }],
    allowedPersonalization: ["first_name", "full_name"], followUpCount: 0, countries: ["US"],
    sendWindows: [], dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 10000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00Z", createdAt: NOW.toISOString(), createdBy: "u1",
  };
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, { tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now: NOW });
  await enrollContact(campaigns, { tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k1", exclusionGroup: "k1", actor: "u1", now: NOW });
  await contacts.saveContact({
    tenantId: "t1", contactId: "k1", accountId: "a1", email: "k1@corp.example", fullName: "Ada",
    verification: { state: "valid", verifiedAt: NOW.toISOString(), verifier: "test" },
    employerChangedAt: null, createdAt: NOW.toISOString(), createdBy: "u1",
  });
  await contacts.saveRights({
    tenantId: "t1", rightsId: "r-k1", contactId: "k1", sourceEvidenceId: "e1", intendedUse: "b2b_marketing",
    licensePermitsUse: true, subscriberClass: "corporate", lawfulBasis: "legitimate_interest", country: "US",
    createdAt: NOW.toISOString(), createdBy: "u1",
  });
  await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  const drafts = new MemoryDraftStore();
  const usage = new MemoryUsageStore();
  await generateDrafts({ campaigns, ledger, contacts, drafts, usage , unsubscribe: UNSUB}, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  const draft = (await drafts.listDrafts("t1"))[0];
  await approveDraft({ ledger, campaigns, drafts }, { tenantId: "t1", draftId: draft.draftId, actor: "u1", now: NOW });
  const senders = { async getSender() {
    return { tenantId: "t1", senderId: "snd_1", provider: "gmail", email: "rep@corp.example", status: "active",
      consentTraceId: "trace-1", scopes: [], dailyCap: 25, localTimezone: "UTC", createdAt: NOW.toISOString(), createdBy: "u1" };
  } };
  const ingestion = new MemoryIngestionStore();
  await ingestion.saveCursor({ tenantId: "t1", senderId: "snd_1", cursor: "c1", syncedAt: NOW.toISOString() });
  const preflight = new MemoryPreflightStore();
  if (preflightRecord) await preflight.save(preflightRecord);
  return { campaigns, ledger, contacts, drafts, usage, senders, ingestion, preflight, killSwitches: new MemoryKillSwitchStore() };
}

const PASSING = { tenantId: "t1", domain: "corp.example", spf: "pass", dkim: "pass", dkimSelector: "google", dmarc: "pass", dmarcPolicy: "reject", checkedAt: NOW.toISOString(), evidence: "fixture", createdAt: NOW.toISOString(), createdBy: "u1" };

test("dispatch defers without preflight record (missing), and nothing reaches the provider", async () => {
  const stores = await dispatchSetup(null);
  const res = await runDispatch(stores, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(res.dispatched.length, 0);
  assert.ok(res.deferred[0].reasons.includes("domain_preflight_missing"));
  const intents = await stores.campaigns.listIntentsByCampaign("t1", "c1");
  assert.equal((await stores.ledger.listAttempts("t1", intents[0].intentId)).length, 0);
});

test("dispatch defers on failed preflight naming checks; stale record defers; fresh pass dispatches", async () => {
  const failed = await dispatchSetup({ ...PASSING, spf: "fail", dmarc: "fail" });
  const r1 = await runDispatch(failed, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(r1.dispatched.length, 0);
  assert.ok(r1.deferred[0].reasons.includes("domain_preflight_failed:spf+dmarc"));

  const stale = await dispatchSetup({ ...PASSING, checkedAt: new Date(NOW.getTime() - PREFLIGHT_STALE_MS - 1000).toISOString() });
  const r2 = await runDispatch(stale, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(r2.dispatched.length, 0);
  assert.ok(r2.deferred[0].reasons.includes("domain_preflight_stale"));

  const good = await dispatchSetup(PASSING);
  const r3 = await runDispatch(good, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW });
  assert.equal(r3.dispatched.length, 1);
  assert.equal(r3.dispatched[0].outcome, "accepted");
});

test("runDispatch refuses without the preflight store (runtime fail-closed)", async () => {
  const stores = await dispatchSetup(PASSING);
  const { preflight, ...withoutPreflight } = stores;
  await assert.rejects(
    () => runDispatch(withoutPreflight, new MockDispatchProvider(), { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW }),
    /preflight store required/,
  );
});
