import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Cross-tenant consent/token/team integration tests against the REAL RTDB
// emulator: token store isolation, single-use OAuth state consumption
// (atomic transaction), consent trace isolation, and team membership
// resolution to the owner's workspace with role gating.

process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.OUTBOUND_DATA_ROOT = "outbound-test";

const { RtdbConsentStore } = await import("../src/lib/outbound/rtdb-consent-store.ts");
const { adminGetMembership, roleAllows } = await import("../src/lib/geo/team.ts");
const { getAdminDatabase } = await import("../src/lib/geo/admin-store.ts");

const realFetch = globalThis.fetch;
const TAG = Date.now().toString(36);
const TA = `cta_${TAG}`;
const TB = `ctb_${TAG}`;

before(async () => {
  const res = await realFetch("http://127.0.0.1:9000/.json?ns=demo-threadly");
  assert.equal(res.status, 200, "RTDB emulator must be running on 127.0.0.1:9000");
});

after(async () => {
  const { getApps } = await import("firebase-admin/app");
  await Promise.all(getApps().map((a) => a.delete()));
});

test("sender tokens are invisible and untouchable across tenants", async () => {
  const store = new RtdbConsentStore();
  await store.saveSenderTokens(TA, "snd_1", "cipher-a");
  // Cross-tenant read of the same sender id: null.
  assert.equal(await store.getSenderTokens(TB, "snd_1"), null);
  // Same-tenant read returns the record.
  assert.equal((await store.getSenderTokens(TA, "snd_1")).ciphertext, "cipher-a");
  // Cross-tenant delete must not remove the owner tenant's tokens.
  await store.deleteSenderTokens(TB, "snd_1");
  assert.equal((await store.getSenderTokens(TA, "snd_1")).ciphertext, "cipher-a");
  // Owner-tenant delete works.
  await store.deleteSenderTokens(TA, "snd_1");
  assert.equal(await store.getSenderTokens(TA, "snd_1"), null);
});

test("consent traces are invisible across tenants", async () => {
  const store = new RtdbConsentStore();
  const trace = {
    tenantId: TA, consentTraceId: "ctc_x1", senderId: "snd_1", provider: "gmail",
    scopes: [], consentedAt: "2026-10-28T00:00:00Z", consentorIdentity: "a@b.co",
    revokedAt: null, createdAt: "2026-10-28T00:00:00Z", createdBy: "oauth-callback",
  };
  await store.saveConsentTrace(trace);
  assert.equal(await store.getConsentTrace(TB, "ctc_x1"), null);
  const got = await store.getConsentTrace(TA, "ctc_x1");
  assert.equal(got.consentTraceId, "ctc_x1");
});

test("consumeOAuthState: single-use per tenant, independent across tenants, one winner under race", async () => {
  const store = new RtdbConsentStore();
  const stateId = `st_${TAG}_a`;
  // First consume wins; replay loses.
  assert.equal(await store.consumeOAuthState(TA, stateId, "2026-10-28T01:00:00Z"), true);
  assert.equal(await store.consumeOAuthState(TA, stateId, "2026-10-28T01:00:00Z"), false);
  // Same state id under a different tenant is independent.
  assert.equal(await store.consumeOAuthState(TB, stateId, "2026-10-28T01:00:00Z"), true);
  // Concurrent consumption of a fresh state: exactly one true.
  const raceId = `st_${TAG}_race`;
  const results = await Promise.all(
    Array.from({ length: 8 }, () => store.consumeOAuthState(TA, raceId, "2026-10-28T01:00:00Z"))
  );
  assert.deepEqual(results.filter(Boolean).length, 1);
  assert.deepEqual(results.filter((r) => !r).length, 7);
});

test("team membership resolves to the owner workspace with role gating", async () => {
  const db = await getAdminDatabase();
  const ownerUid = `own_${TAG}`;
  const memberUid = `mem_${TAG}`;
  await db.ref(`memberships/${memberUid}`).set({ ownerUid, role: "member", addedAt: "2026-10-28T00:00:00Z" });
  const membership = await adminGetMembership(memberUid);
  assert.equal(membership.ownerUid, ownerUid);
  assert.equal(membership.role, "member");
  // Member cannot manage team/senders; admin and owner can.
  assert.equal(roleAllows(membership.role, "manageTeam"), false);
  assert.equal(roleAllows("admin", "manageTeam"), true);
  assert.equal(roleAllows("owner", "manageTeam"), true);
  assert.equal(roleAllows("member", "view"), true);
  // Unknown uid has no membership.
  assert.equal(await adminGetMembership(`none_${TAG}`), null);
  await db.ref(`memberships/${memberUid}`).remove();
});
