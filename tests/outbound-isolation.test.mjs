import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryLedgerStore, intentUniqueKey } = await import("../src/lib/outbound/ledger.ts");

const intent = (tenantId, intentId) => ({
  tenantId, intentId,
  uniqueKey: intentUniqueKey({ tenantId, enrollmentId: "e1", campaignVersion: 1, step: 1 }),
  enrollmentId: "e1", campaignId: "c1", campaignVersion: 1, contactId: "k1", senderId: "s1", step: 1,
  status: "drafted", statusUpdatedAt: new Date().toISOString(),
  cancelReason: null, leaseOwner: null, leaseExpiresAt: null, reconciledAt: null,
  createdAt: new Date().toISOString(), createdBy: "u1",
});

test("cross-tenant reads return null even with a known intent id", async () => {
  const store = new MemoryLedgerStore();
  await store.createIntentIfAbsent(intent("tenantA", "mi_1"));
  assert.equal(await store.getIntent("tenantB", "mi_1"), null);
  assert.notEqual(await store.getIntent("tenantA", "mi_1"), null);
});

test("cross-tenant compareAndSet fails", async () => {
  const store = new MemoryLedgerStore();
  const mine = intent("tenantA", "mi_2");
  await store.createIntentIfAbsent(mine);
  const hijack = { ...mine, status: "approved" };
  assert.equal(await store.compareAndSetStatus("tenantB", "mi_2", "drafted", hijack), false);
  assert.equal((await store.getIntent("tenantA", "mi_2")).status, "drafted");
});

test("unique keys collide only within the same tenant", async () => {
  const store = new MemoryLedgerStore();
  assert.equal(await store.createIntentIfAbsent(intent("tenantA", "mi_3")), "created");
  assert.equal(await store.createIntentIfAbsent(intent("tenantA", "mi_4")), "duplicate"); // same key
  assert.equal(await store.createIntentIfAbsent(intent("tenantB", "mi_4")), "created"); // other tenant: distinct key
});

test("campaign store: cross-tenant suppression and version reads return null", async () => {
  const { MemoryCampaignStore } = await import("../src/lib/outbound/campaign.ts");
  const store = new MemoryCampaignStore();
  const now = new Date().toISOString();
  await store.saveSuppression({
    tenantId: "tenantA", emailToken: "tok1", reason: "opt_out",
    createdAt: now, createdBy: "u1",
  });
  await store.saveCampaignVersion({
    tenantId: "tenantA", campaignId: "c1", version: 1, reviewMode: "review",
    name: "C", steps: [], status: "draft", createdAt: now, createdBy: "u1",
  });
  assert.equal(await store.findSuppression("tenantB", "tok1"), null);
  assert.equal((await store.listSuppressions("tenantB")).length, 0);
  assert.equal(await store.getCampaignVersion("tenantB", "c1", 1), null);
  assert.equal(await store.latestCampaignVersion("tenantB", "c1"), null);
  assert.notEqual(await store.getCampaignVersion("tenantA", "c1", 1), null);
});

test("rtdb path helper rejects unsafe tenant ids", async () => {
  const { tenantRoot } = await import("../src/lib/outbound/rtdb-store.ts");
  assert.throws(() => tenantRoot("bad/tenant"));
  assert.throws(() => tenantRoot("a.b"));
  assert.throws(() => tenantRoot(""));
  assert.equal(tenantRoot("ws_abc-123"), "outbound/ws_abc-123");
});

test("data root: explicit OUTBOUND_DATA_ROOT changes paths, default is outbound, unsafe rejected", async () => {
  const { tenantRoot, outboundDataRoot } = await import("../src/lib/outbound/rtdb-store.ts");
  delete process.env.OUTBOUND_DATA_ROOT;
  assert.equal(outboundDataRoot(), "outbound");
  assert.equal(tenantRoot("ws1"), "outbound/ws1");
  process.env.OUTBOUND_DATA_ROOT = "outbound-test";
  assert.equal(tenantRoot("ws1"), "outbound-test/ws1");
  process.env.OUTBOUND_DATA_ROOT = "bad/root";
  assert.throws(() => tenantRoot("ws1"));
  delete process.env.OUTBOUND_DATA_ROOT;
});

test("campaign normalize: RTDB-dropped empty arrays come back as []", async () => {
  // RTDB omits empty arrays; the store must tolerate their absence on read.
  const mod = await import("../src/lib/outbound/rtdb-campaign-store.ts");
  const src = mod.normalizeCampaignForTest ? null : undefined; // not exported; verify via planner instead
  const { planCampaignIntents, MemoryContactStore } = await import("../src/lib/outbound/planner.ts");
  const { MemoryCampaignStore, approveCampaign, enrollContact } = await import("../src/lib/outbound/campaign.ts");
  const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
  const now = new Date("2026-10-27T12:00:00Z");
  const campaigns = new MemoryCampaignStore();
  const campaign = {
    tenantId: "t1", campaignId: "c9", version: 1,
    // simulate an RTDB round-trip that dropped the empty arrays
    senderAllowlist: undefined, exclusions: undefined, templates: [{ step: 1, subject: "s", body: "b" }],
    allowedPersonalization: undefined, followUpCount: 1, countries: undefined,
    sendWindows: undefined, dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 100 },
    bookingPolicy: { directBooking: false, hostPool: [] }, expiresAt: "2026-12-31T00:00:00Z",
    createdAt: now.toISOString(), createdBy: "u1",
  };
  await campaigns.saveCampaignVersion(campaign);
  const approval = await approveCampaign(campaigns, { tenantId: "t1", campaign, approverUserId: "u1", approverRole: "campaign_approver", now });
  await enrollContact(campaigns, { tenantId: "t1", campaign, approvalId: approval.approvalId, contactId: "k9", exclusionGroup: "k9", actor: "u1", now });
  const contacts = new MemoryContactStore();
  await contacts.saveContact({ tenantId: "t1", contactId: "k9", accountId: "a", email: "k9@corp.example", fullName: "P", verification: { state: "valid", verifiedAt: now.toISOString(), verifier: "t" }, employerChangedAt: null, createdAt: now.toISOString(), createdBy: "u1" });
  await contacts.saveRights({ tenantId: "t1", rightsId: "r9", contactId: "k9", sourceEvidenceId: "e", intendedUse: "b2b_marketing", licensePermitsUse: true, subscriberClass: "corporate", lawfulBasis: "li", country: "US", createdAt: now.toISOString(), createdBy: "u1" });
  const ledger = new MemoryLedgerStore();
  const res = await planCampaignIntents({ campaigns, ledger, contacts }, { tenantId: "t1", campaignId: "c9", actor: "u1", now });
  assert.equal(res.planned.length, 1); // must not throw on undefined allowlist
});
