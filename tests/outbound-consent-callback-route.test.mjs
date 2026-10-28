import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

// Route-level tests for the UNAUTHENTICATED browser path of the consent
// callback (no Authorization header - exactly what a bare Google redirect
// sends). The signed, expiring, single-use state is the only credential on
// this route; these tests prove it fails closed on tamper, expiry, replay,
// cross-tenant binding and concurrent callbacks.
// Requires the RTDB emulator on localhost:9000 (project demo-threadly).

process.env.OUTBOUND_ENABLED = "true";
process.env.OUTBOUND_DATA_ROOT = "outbound-route-test";
process.env.OUTBOUND_OAUTH_STATE_KEY = "test-state-key-0123456789abcdef";
process.env.OUTBOUND_TOKEN_KEY = randomBytes(32).toString("hex");
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "localhost:9000";
process.env.FIREBASE_PROJECT_ID = "demo-threadly";
delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;

import { register } from "node:module";
register(new URL("./alias-loader.mjs", import.meta.url));
const { GET } = await import("../src/app/api/outbound/senders/consent/callback/route.ts");
const { createOAuthState } = await import("../src/lib/outbound/oauth-state.ts");
const { RtdbConsentStore } = await import("../src/lib/outbound/rtdb-consent-store.ts");
const { RtdbSenderStore } = await import("../src/lib/outbound/rtdb-sender-store.ts");

const records = new RtdbConsentStore();
const senders = new RtdbSenderStore();
const BASE = "https://app.test/api/outbound/senders/consent/callback";
const get = (qs) => GET(new Request(`${BASE}?${qs}`)); // no Authorization header: browser path

async function resetDb() {
  const res = await fetch("http://localhost:9000/.json?ns=demo-threadly", { method: "DELETE" });
  assert.ok(res.ok, `emulator reset failed: ${res.status}`);
}
const stateId = (state) => createHash("sha256").update(state, "utf8").digest("hex");
function tamperPayload(state, mutate) {
  const dot = state.lastIndexOf(".");
  const payload = JSON.parse(Buffer.from(state.slice(0, dot), "base64url").toString("utf8"));
  mutate(payload);
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${b64}.${state.slice(dot + 1)}`; // original signature, changed payload
}

before(resetDb);

test("browser path: missing state/code rejected", async () => {
  await resetDb();
  assert.equal((await get("")).status, 400);
  assert.equal((await get("state=x")).status, 400);
});

test("browser path: provider error surfaces as 400, nothing consumed", async () => {
  const res = await get("error=access_denied&state=x&code=y");
  assert.equal(res.status, 400);
  assert.match(await res.text(), /access_denied/);
});

test("browser path: tampered state payload rejected (signature)", async () => {
  const { state } = createOAuthState({ tenantId: "tA", senderId: "snd_1", provider: "gmail" });
  const tampered = tamperPayload(state, (p) => { p.tenantId = "tB"; });
  const res = await get(`state=${encodeURIComponent(tampered)}&code=x`);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Invalid consent state/);
});

test("browser path: tampered provider field rejected (signature)", async () => {
  const { state } = createOAuthState({ tenantId: "tA", senderId: "", provider: "gmail" });
  const tampered = tamperPayload(state, (p) => { p.provider = "microsoft"; });
  const res = await get(`state=${encodeURIComponent(tampered)}&code=x`);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Invalid consent state/);
});

test("browser path: expired state rejected", async () => {
  const { state } = createOAuthState({ tenantId: "tA", senderId: "snd_1", ttlMs: -1000 });
  const res = await get(`state=${encodeURIComponent(state)}&code=x`);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /expired/);
});

test("browser path: replayed (pre-consumed) state rejected with 409", async () => {
  await resetDb();
  const { state, expiresAt } = createOAuthState({ tenantId: "tA", senderId: "snd_1", provider: "gmail" });
  assert.equal(await records.consumeOAuthState("tA", stateId(state), expiresAt), true); // first use
  const res = await get(`state=${encodeURIComponent(state)}&code=x`);
  assert.equal(res.status, 409);
  assert.match(await res.text(), /already used/);
});

test("browser path: state cannot touch another tenant's sender (404)", async () => {
  await resetDb();
  const nowIso = new Date().toISOString();
  await senders.saveSender({
    tenantId: "tA", senderId: "snd_onlyA", provider: "gmail", email: "a@example.com",
    status: "pending_consent", consentTraceId: null, scopes: [], dailyCap: 0,
    localTimezone: "UTC", createdAt: nowIso, createdBy: "test",
  });
  // State minted for tenant B naming tenant A's sender: resolves in tenant B only.
  const { state } = createOAuthState({ tenantId: "tB", senderId: "snd_onlyA", provider: "gmail" });
  const res = await get(`state=${encodeURIComponent(state)}&code=x`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Sender not found/);
  const senderA = await senders.getSender("tA", "snd_onlyA");
  assert.equal(senderA.status, "pending_consent", "tenant A sender must stay untouched");
});

test("browser path: concurrent callbacks with one state resolve to exactly one winner", async () => {
  await resetDb();
  const { state } = createOAuthState({ tenantId: "tA", senderId: "", provider: "gmail" });
  const qs = `state=${encodeURIComponent(state)}&code=fake-code`;
  const [r1, r2] = await Promise.all([get(qs), get(qs)]);
  const statuses = [r1.status, r2.status].sort();
  // Exactly one callback consumes the state; the loser is 409. The winner
  // proceeds to the provider exchange, which cannot succeed here (no real
  // Google), so it must NOT be a success and must NOT create or activate
  // anything.
  assert.deepEqual(statuses.filter((s) => s === 409).length, 1, `expected exactly one 409, got ${statuses}`);
  const winner = statuses.find((s) => s !== 409);
  assert.ok(winner >= 500, `winner must fail at provider exchange, got ${winner}`);
  const all = await senders.listSenders("tA");
  assert.equal(all.filter((s) => s.status === "active").length, 0, "no sender may activate without a completed exchange");
});

after(async () => {
  const mod = await import("firebase-admin");
  const admin = mod.default ?? mod;
  const apps = admin.apps ?? admin.getApps?.() ?? [];
  await Promise.all(apps.map((a) => a?.delete()));
});
