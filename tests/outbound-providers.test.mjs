import { test } from "node:test";
import assert from "node:assert/strict";

const { encryptSecret, decryptSecret } = await import("../src/lib/outbound/token-crypto.ts");
const { createOAuthState, verifyOAuthState } = await import("../src/lib/outbound/oauth-state.ts");
const { GmailAdapter } = await import("../src/lib/outbound/providers/gmail.ts");
const { MicrosoftAdapter } = await import("../src/lib/outbound/providers/microsoft.ts");
const { liveProvidersEnabled } = await import("../src/lib/outbound/providers/registry.ts");
const { beginConsent, completeConsent, revokeConsent } = await import("../src/lib/outbound/consent-flow.ts");

const KEY = "a".repeat(64);
process.env.OUTBOUND_TOKEN_KEY = KEY;
process.env.OUTBOUND_OAUTH_STATE_KEY = "test-state-key-0123456789";

function sender(overrides = {}) {
  return {
    tenantId: "t1", senderId: "snd_1", provider: "gmail", email: "rep@example.com",
    status: "pending_consent", consentTraceId: null, scopes: [], dailyCap: 25,
    localTimezone: "UTC", createdAt: "2026-10-28T00:00:00Z", createdBy: "u1",
    ...overrides,
  };
}

function memorySenders(initial) {
  const map = new Map(initial.map((s) => [s.senderId, { ...s }]));
  return {
    map,
    async getSender(tenantId, senderId) { const s = map.get(senderId); return s && s.tenantId === tenantId ? s : null; },
    async activateSenderFromConsent(tenantId, senderId, consentTraceId, scopes) {
      const s = map.get(senderId);
      assert.equal(s.status === "pending_consent" || s.status === "revoked", true);
      const updated = { ...s, status: "active", consentTraceId, scopes };
      map.set(senderId, updated);
      return updated;
    },
    async revokeSender(tenantId, senderId) {
      const s = map.get(senderId);
      const updated = { ...s, status: "revoked" };
      map.set(senderId, updated);
      return updated;
    },
  };
}

function memoryRecords() {
  const traces = new Map();
  const tokens = new Map();
  return {
    traces, tokens,
    async saveConsentTrace(t) { traces.set(t.consentTraceId, t); },
    async getConsentTrace(tenantId, id) { return traces.get(id) ?? null; },
    async saveSenderTokens(tenantId, senderId, ciphertext) { tokens.set(senderId, ciphertext); },
    async deleteSenderTokens(tenantId, senderId) { tokens.delete(senderId); },
  };
}

test("token crypto round-trips and rejects tampering and wrong keys", () => {
  const blob = encryptSecret('{"accessToken":"x"}');
  assert.equal(decryptSecret(blob), '{"accessToken":"x"}');
  assert.throws(() => decryptSecret(blob.slice(0, -4) + "AAAA"));
  const saved = process.env.OUTBOUND_TOKEN_KEY;
  process.env.OUTBOUND_TOKEN_KEY = "b".repeat(64);
  assert.throws(() => decryptSecret(blob));
  process.env.OUTBOUND_TOKEN_KEY = saved;
});

test("oauth state signs, verifies, and rejects tampering and expiry", () => {
  const { state } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });
  assert.deepEqual(verifyOAuthState(state), { tenantId: "t1", senderId: "snd_1" });
  assert.throws(() => verifyOAuthState(state.slice(0, -2) + "zz"));
  const { state: expired } = createOAuthState({ tenantId: "t1", senderId: "snd_1", ttlMs: -1000 });
  assert.throws(() => verifyOAuthState(expired), /expired/);
});

test("gmail consent url requests send-only scope with offline access", () => {
  const url = new GmailAdapter().buildConsentUrl({ clientId: "cid", redirectUri: "https://app/cb", state: "st", loginHint: "rep@example.com" });
  const params = new URL(url).searchParams;
  assert.equal(params.get("scope"), "https://www.googleapis.com/auth/gmail.send");
  assert.equal(params.get("access_type"), "offline");
  assert.equal(params.get("login_hint"), "rep@example.com");
  assert.equal(params.get("state"), "st");
});

test("microsoft consent url requests Mail.Send + offline_access", () => {
  const url = new MicrosoftAdapter().buildConsentUrl({ clientId: "cid", redirectUri: "https://app/cb", state: "st", loginHint: "rep@example.com" });
  const scope = new URL(url).searchParams.get("scope");
  assert.ok(scope.includes("Mail.Send"));
  assert.ok(scope.includes("offline_access"));
});

test("gmail send maps 200 to accepted, 4xx to rejected, 5xx/network to unknown", async () => {
  const request = { intentId: "i1", to: "a@b.co", fromEmail: "rep@example.com", subject: "Hi", bodyText: "Body" };
  let adapter = new GmailAdapter(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  let out = await adapter.send({ accessToken: "t", request });
  assert.deepEqual(out, { outcome: "accepted", providerCorrelationId: "m1", statusCode: 200 });
  adapter = new GmailAdapter(async () => new Response("bad", { status: 400 }));
  out = await adapter.send({ accessToken: "t", request });
  assert.equal(out.outcome, "rejected");
  assert.equal(out.statusCode, 400);
  adapter = new GmailAdapter(async () => new Response("err", { status: 500 }));
  out = await adapter.send({ accessToken: "t", request });
  assert.equal(out.outcome, "unknown");
  adapter = new GmailAdapter(async () => { throw new Error("boom"); });
  out = await adapter.send({ accessToken: "t", request });
  assert.equal(out.outcome, "unknown");
  assert.equal(out.statusCode, null);
});

test("microsoft send maps 202 to accepted with request-id, 403 to rejected", async () => {
  const request = { intentId: "i1", to: "a@b.co", fromEmail: "rep@example.com", subject: "Hi", bodyText: "Body" };
  let adapter = new MicrosoftAdapter(async () => new Response(null, { status: 202, headers: { "request-id": "req-9" } }));
  let out = await adapter.send({ accessToken: "t", request });
  assert.deepEqual(out, { outcome: "accepted", providerCorrelationId: "req-9", statusCode: 202 });
  adapter = new MicrosoftAdapter(async () => new Response("denied", { status: 403 }));
  out = await adapter.send({ accessToken: "t", request });
  assert.equal(out.outcome, "rejected");
});

test("live provider flag is off by default", () => {
  assert.equal(liveProvidersEnabled(), false);
});

test("beginConsent returns 503 with required envs when provider client is not configured", async () => {
  delete process.env.OUTBOUND_GMAIL_CLIENT_ID;
  const result = await beginConsent(memorySenders([sender()]), { tenantId: "t1", senderId: "snd_1" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.ok(result.requiredEnvs.includes("OUTBOUND_GMAIL_CLIENT_ID"));
});

test("completeConsent activates only when the consented mailbox matches the sender", async () => {
  process.env.OUTBOUND_GMAIL_CLIENT_ID = "cid";
  process.env.OUTBOUND_GMAIL_CLIENT_SECRET = "sec";
  process.env.OUTBOUND_GMAIL_REDIRECT_URI = "https://app/cb";
  const { state } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });

  // Matching mailbox: activates, stores trace + encrypted tokens.
  const senders = memorySenders([sender()]);
  const records = memoryRecords();
  const goodFetch = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.send" }), { status: 200 });
    }
    return new Response(JSON.stringify({ emailAddress: "rep@example.com" }), { status: 200 });
  };
  const done = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "code1", fetchImpl: goodFetch });
  assert.equal(done.ok, true);
  const updated = await senders.getSender("t1", "snd_1");
  assert.equal(updated.status, "active");
  assert.equal(updated.consentTraceId, done.consentTraceId);
  assert.ok(records.traces.has(done.consentTraceId));
  const stored = records.tokens.get("snd_1");
  assert.ok(!stored.includes("at")); // ciphertext, never plaintext
  assert.equal(JSON.parse(decryptSecret(stored)).accessToken, "at");

  // Cross-tenant state rejected.
  const { state: other } = createOAuthState({ tenantId: "t2", senderId: "snd_1" });
  const cross = await completeConsent(memorySenders([sender()]), memoryRecords(), { expectedTenantId: "t1", state: other, code: "c", fetchImpl: goodFetch });
  assert.equal(cross.status, 403);

  // Mailbox mismatch: refuses, sender stays pending_consent.
  const senders2 = memorySenders([sender()]);
  const { state: state2 } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });
  const badFetch = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ emailAddress: "someone-else@example.com" }), { status: 200 });
  };
  const mismatch = await completeConsent(senders2, memoryRecords(), { expectedTenantId: "t1", state: state2, code: "c", fetchImpl: badFetch });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, 409);
  assert.equal((await senders2.getSender("t1", "snd_1")).status, "pending_consent");

  delete process.env.OUTBOUND_GMAIL_CLIENT_ID;
  delete process.env.OUTBOUND_GMAIL_CLIENT_SECRET;
  delete process.env.OUTBOUND_GMAIL_REDIRECT_URI;
});

test("revokeConsent deletes tokens, revokes trace and sender", async () => {
  const senders = memorySenders([sender({ status: "active", consentTraceId: "ctc_1" })]);
  const records = memoryRecords();
  await records.saveConsentTrace({ tenantId: "t1", consentTraceId: "ctc_1", senderId: "snd_1", provider: "gmail", scopes: [], consentedAt: "2026-10-28T00:00:00Z", consentorIdentity: "rep@example.com", revokedAt: null, createdAt: "2026-10-28T00:00:00Z", createdBy: "oauth-callback" });
  await records.saveSenderTokens("t1", "snd_1", "blob");
  const result = await revokeConsent(senders, records, { tenantId: "t1", senderId: "snd_1" });
  assert.equal(result.ok, true);
  assert.equal((await senders.getSender("t1", "snd_1")).status, "revoked");
  assert.equal(records.tokens.has("snd_1"), false);
  assert.ok(records.traces.get("ctc_1").revokedAt);
});
