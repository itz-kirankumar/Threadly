import { test } from "node:test";
import assert from "node:assert/strict";

const { encryptSecret, decryptSecret } = await import("../src/lib/outbound/token-crypto.ts");
const { createOAuthState, verifyOAuthState } = await import("../src/lib/outbound/oauth-state.ts");
const { GmailAdapter } = await import("../src/lib/outbound/providers/gmail.ts");
const { MicrosoftAdapter } = await import("../src/lib/outbound/providers/microsoft.ts");
const { liveProvidersEnabled } = await import("../src/lib/outbound/providers/registry.ts");
const { beginConsent, beginConsentFirst, completeConsent, revokeConsent } = await import("../src/lib/outbound/consent-flow.ts");

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
    async listSenders(tenantId) { return [...map.values()].filter((s) => s.tenantId === tenantId); },
    async saveSender(s) { map.set(s.senderId, { ...s }); },
    async activateSenderFromConsent(tenantId, senderId, consentTraceId, scopes) {
      const s = map.get(senderId);
      assert.equal(s.status === "pending_consent" || s.status === "revoked" || s.status === "active", true);
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
  const consumed = new Set();
  return {
    traces, tokens, consumed,
    async consumeOAuthState(tenantId, stateId) {
      const key = `${tenantId}:${stateId}`;
      if (consumed.has(key)) return false;
      consumed.add(key);
      return true;
    },
    async saveConsentTrace(t) { traces.set(t.consentTraceId, t); },
    async getConsentTrace(tenantId, id) { return traces.get(id) ?? null; },
    async saveSenderTokens(tenantId, senderId, ciphertext) { tokens.set(senderId, ciphertext); },
    async getSenderTokens(tenantId, senderId) { const c = tokens.get(senderId); return c ? { ciphertext: c } : null; },
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
  const verified = verifyOAuthState(state);
  assert.equal(verified.tenantId, "t1");
  assert.equal(verified.senderId, "snd_1");
  assert.equal(verified.purpose, "send");
  assert.equal(verified.provider, null);
  assert.equal(typeof verified.nonce, "string");
  assert.ok(verified.nonce.length > 0);
  assert.throws(() => verifyOAuthState(state.slice(0, -2) + "zz"));
  const { state: expired } = createOAuthState({ tenantId: "t1", senderId: "snd_1", ttlMs: -1000 });
  assert.throws(() => verifyOAuthState(expired), /expired/);
});

test("gmail consent url requests send + documented identity scope with offline access", () => {
  const url = new GmailAdapter().buildConsentUrl({ clientId: "cid", redirectUri: "https://app/cb", state: "st", loginHint: "rep@example.com" });
  const params = new URL(url).searchParams;
  assert.equal(params.get("scope"), "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email");
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
    return new Response(JSON.stringify({ email: "rep@example.com" }), { status: 200 });
  };
  const done = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "code1", fetchImpl: goodFetch });
  assert.equal(done.ok, true);
  const updated = await senders.getSender("t1", "snd_1");
  assert.equal(updated.status, "active");
  assert.equal(updated.consentTraceId, done.consentTraceId);
  assert.ok(records.traces.has(done.consentTraceId));
  const stored = records.tokens.get("snd_1");
  // Ciphertext, never plaintext. (Not a 2-char substring check: random
  // base64 ciphertext contains "at" by chance ~1 run in 5. The field name
  // is long enough that an accidental collision is negligible.)
  assert.ok(!stored.includes("accessToken"));
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
    return new Response(JSON.stringify({ email: "someone-else@example.com" }), { status: 200 });
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

test("replayed consent state cannot activate twice", async () => {
  process.env.OUTBOUND_GMAIL_CLIENT_ID = "cid";
  process.env.OUTBOUND_GMAIL_CLIENT_SECRET = "sec";
  process.env.OUTBOUND_GMAIL_REDIRECT_URI = "https://app/cb";
  const { state } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });
  const goodFetch = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.send" }), { status: 200 });
    }
    return new Response(JSON.stringify({ email: "rep@example.com" }), { status: 200 });
  };
  const senders = memorySenders([sender()]);
  const first = await completeConsent(senders, memoryRecords(), { expectedTenantId: "t1", state, code: "code1", fetchImpl: goodFetch });
  assert.equal(first.ok, true);
  const replay = await completeConsent(senders, memoryRecords(), { expectedTenantId: "t1", state, code: "code1", fetchImpl: goodFetch });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409); // single-use state: replay rejected
  delete process.env.OUTBOUND_GMAIL_CLIENT_ID;
  delete process.env.OUTBOUND_GMAIL_CLIENT_SECRET;
  delete process.env.OUTBOUND_GMAIL_REDIRECT_URI;
});

test("gmail adapter scopes: documented identity + freebusy minimums", () => {
  const a = new GmailAdapter(async () => { throw new Error("no fetch"); });
  assert.ok(a.consentScopes.includes("https://www.googleapis.com/auth/gmail.send"));
  assert.ok(a.consentScopes.includes("https://www.googleapis.com/auth/userinfo.email"));
  assert.ok(a.calendarScopes.includes("https://www.googleapis.com/auth/calendar.events"));
  assert.ok(a.calendarScopes.includes("https://www.googleapis.com/auth/calendar.events.freebusy"));
});

test("gmail fetchProfile uses the documented oauth2 userinfo endpoint", async () => {
  let seen = "";
  const a = new GmailAdapter(async (url) => { seen = String(url); return new Response(JSON.stringify({ email: "rep@example.com" }), { status: 200 }); });
  const profile = await a.fetchProfile({ accessToken: "x" });
  assert.equal(profile.email, "rep@example.com");
  assert.equal(seen, "https://www.googleapis.com/oauth2/v2/userinfo");
});

test("gmail revokeTokens reports truthful success/failure", async () => {
  const ok = new GmailAdapter(async () => new Response("", { status: 200 }));
  assert.equal(await ok.revokeTokens({ token: "r1" }), true);
  const bad = new GmailAdapter(async () => new Response("", { status: 400 }));
  assert.equal(await bad.revokeTokens({ token: "r1" }), false);
  const down = new GmailAdapter(async () => { throw new Error("network"); });
  assert.equal(await down.revokeTokens({ token: "r1" }), false);
});

test("revokeConsent audits provider revocation truthfully and stays fail-closed locally", async () => {
  const senders = memorySenders([sender({ status: "active", consentTraceId: "ctc_1" })]);
  const records = memoryRecords();
  await records.saveConsentTrace({ tenantId: "t1", consentTraceId: "ctc_1", senderId: "snd_1", provider: "gmail", scopes: [], consentedAt: "2026-10-28T00:00:00Z", consentorIdentity: "rep@example.com", revokedAt: null, createdAt: "2026-10-28T00:00:00Z", createdBy: "oauth-callback" });
  await records.saveSenderTokens("t1", "snd_1", encryptSecret(JSON.stringify({ accessToken: "at", refreshToken: "rt" })));
  const audits = [];
  const audit = { async append(e) { audits.push(e); } };
  // Provider confirms revocation.
  const okFetch = async () => new Response("", { status: 200 });
  const r1 = await revokeConsent(senders, records, { tenantId: "t1", senderId: "snd_1", fetchImpl: okFetch, audit });
  assert.equal(r1.ok, true);
  assert.match(audits.at(-1).detail, /provider_revoked:true/);
  assert.equal(records.tokens.has("snd_1"), false);
  assert.equal((await senders.getSender("t1", "snd_1")).status, "revoked");
  // Provider revocation fails: local delete still happens, audit says false.
  const senders2 = memorySenders([sender({ status: "active", consentTraceId: "ctc_2" })]);
  const records2 = memoryRecords();
  await records2.saveSenderTokens("t1", "snd_1", encryptSecret(JSON.stringify({ accessToken: "at" })));
  const audits2 = [];
  const failFetch = async () => new Response("", { status: 400 });
  const r2 = await revokeConsent(senders2, records2, { tenantId: "t1", senderId: "snd_1", fetchImpl: failFetch, audit: { async append(e) { audits2.push(e); } } });
  assert.equal(r2.ok, true);
  assert.match(audits2.at(-1).detail, /provider_revoked:false/);
  assert.equal(records2.tokens.has("snd_1"), false);
  assert.equal((await senders2.getSender("t1", "snd_1")).status, "revoked");
});

const GMAIL_ENV = () => {
  process.env.OUTBOUND_GMAIL_CLIENT_ID = "cid";
  process.env.OUTBOUND_GMAIL_CLIENT_SECRET = "sec";
  process.env.OUTBOUND_GMAIL_REDIRECT_URI = "https://app/cb";
};
const GMAIL_ENV_CLEAR = () => {
  delete process.env.OUTBOUND_GMAIL_CLIENT_ID;
  delete process.env.OUTBOUND_GMAIL_CLIENT_SECRET;
  delete process.env.OUTBOUND_GMAIL_REDIRECT_URI;
};
const goodFetchFor = (email) => async (url) => {
  if (url.includes("oauth2.googleapis.com/token")) {
    return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.send" }), { status: 200 });
  }
  return new Response(JSON.stringify({ email }), { status: 200 });
};

test("consent state is single-use: revoke-then-replay cannot reactivate", async () => {
  GMAIL_ENV();
  const { state } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });
  const senders = memorySenders([sender()]);
  const records = memoryRecords();
  const first = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("rep@example.com") });
  assert.equal(first.ok, true);
  await revokeConsent(senders, records, { tenantId: "t1", senderId: "snd_1" });
  assert.equal((await senders.getSender("t1", "snd_1")).status, "revoked");
  // Status alone would now allow consent again; the consumed state must not.
  const replay = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("rep@example.com") });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
  assert.match(replay.error, /already used/);
  assert.equal((await senders.getSender("t1", "snd_1")).status, "revoked");
  GMAIL_ENV_CLEAR();
});

test("concurrent callbacks with the same state resolve to exactly one activation", async () => {
  GMAIL_ENV();
  const { state } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });
  const senders = memorySenders([sender()]);
  const records = memoryRecords();
  const [a, b] = await Promise.all([
    completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("rep@example.com") }),
    completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("rep@example.com") }),
  ]);
  const outcomes = [a.ok, b.ok].sort();
  assert.deepEqual(outcomes, [false, true]);
  const loser = a.ok ? b : a;
  assert.equal(loser.status, 409);
  assert.equal(records.traces.size, 1);
  GMAIL_ENV_CLEAR();
});

test("consent-first: beginConsentFirst builds a sender-less URL and completeConsent auto-registers by verified identity", async () => {
  GMAIL_ENV();
  const start = await beginConsentFirst({ tenantId: "t1", provider: "gmail" });
  assert.equal(start.ok, true);
  const params = new URL(start.consentUrl).searchParams;
  assert.equal(params.get("login_hint"), null);
  const state = params.get("state");
  const verified = verifyOAuthState(state);
  assert.equal(verified.senderId, "");
  assert.equal(verified.provider, "gmail");
  assert.equal(verified.tenantId, "t1");

  const senders = memorySenders([]);
  const records = memoryRecords();
  const done = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("NewUser@Example.com") });
  assert.equal(done.ok, true);
  const all = await senders.listSenders("t1");
  assert.equal(all.length, 1);
  assert.equal(all[0].email, "newuser@example.com"); // normalized verified identity, not caller input
  assert.equal(all[0].status, "active");
  assert.equal(all[0].dailyCap, 0); // dispatch gate: explicit cap still required
  assert.equal(all[0].createdBy, "oauth-callback");
  assert.equal(done.consentorIdentity, "newuser@example.com");

  // Replay of the same state: consumed, no duplicate sender.
  const replay = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("newuser@example.com") });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
  assert.equal((await senders.listSenders("t1")).length, 1);
  GMAIL_ENV_CLEAR();
});

test("consent-first binding: existing sender reconnects, active refuses, provider mismatch refuses", async () => {
  GMAIL_ENV();
  // Existing pending sender with the consented mailbox: reconnect, no duplicate.
  const senders = memorySenders([sender()]);
  const records = memoryRecords();
  const { state: s1 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail" });
  const done = await completeConsent(senders, records, { expectedTenantId: "t1", state: s1, code: "c", fetchImpl: goodFetchFor("rep@example.com") });
  assert.equal(done.ok, true);
  assert.equal(done.senderId, "snd_1");
  assert.equal((await senders.listSenders("t1")).length, 1);

  // Already-active sender: fresh consent-first state refuses.
  const { state: s2 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail" });
  const again = await completeConsent(senders, records, { expectedTenantId: "t1", state: s2, code: "c", fetchImpl: goodFetchFor("rep@example.com") });
  assert.equal(again.ok, false);
  assert.equal(again.status, 409);
  assert.match(again.error, /already connected/);

  // Provider mismatch: mailbox registered for microsoft refuses gmail connect.
  const senders2 = memorySenders([sender({ provider: "microsoft" })]);
  const { state: s3 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail" });
  const mismatch = await completeConsent(senders2, memoryRecords(), { expectedTenantId: "t1", state: s3, code: "c", fetchImpl: goodFetchFor("rep@example.com") });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.status, 409);
  assert.match(mismatch.error, /microsoft/);
  GMAIL_ENV_CLEAR();
});

test("consent-first: unverifiable identity or failed exchange creates nothing", async () => {
  GMAIL_ENV();
  // Identity endpoint fails: 502, no sender, no tokens, no trace.
  const senders = memorySenders([]);
  const records = memoryRecords();
  const badIdentity = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
    }
    return new Response("denied", { status: 403 });
  };
  const { state: s1 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail" });
  const r1 = await completeConsent(senders, records, { expectedTenantId: "t1", state: s1, code: "c", fetchImpl: badIdentity });
  assert.equal(r1.ok, false);
  assert.equal(r1.status, 502);
  assert.equal((await senders.listSenders("t1")).length, 0);
  assert.equal(records.traces.size, 0);

  // Token exchange rejected: 502, nothing persisted.
  const badExchange = async () => new Response("invalid_grant", { status: 400 });
  const { state: s2 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail" });
  const r2 = await completeConsent(senders, records, { expectedTenantId: "t1", state: s2, code: "c", fetchImpl: badExchange });
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 502);
  assert.equal(records.traces.size, 0);
  GMAIL_ENV_CLEAR();
});

test("partial token-save failure never activates the sender", async () => {
  GMAIL_ENV();
  const senders = memorySenders([sender()]);
  const records = memoryRecords();
  records.saveSenderTokens = async () => { throw new Error("rtdb write failed"); };
  const { state } = createOAuthState({ tenantId: "t1", senderId: "snd_1" });
  await assert.rejects(
    completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: goodFetchFor("rep@example.com") }),
    /rtdb write failed/,
  );
  assert.equal((await senders.getSender("t1", "snd_1")).status, "pending_consent");
  assert.equal(records.traces.size, 0);
  GMAIL_ENV_CLEAR();
});

test("consent-first calendar purpose extends an active sender's scopes (union, never narrow)", async () => {
  GMAIL_ENV();
  // Active gmail sender from an earlier send consent.
  const senders = memorySenders([sender({ status: "active", consentTraceId: "ctc_old", scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"] })]);
  const records = memoryRecords();
  const calendarFetch = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at2", refresh_token: "rt2", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy" }), { status: 200 });
    }
    return new Response(JSON.stringify({ email: "rep@example.com" }), { status: 200 });
  };
  const { state } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail", purpose: "calendar" });
  const done = await completeConsent(senders, records, { expectedTenantId: "t1", state, code: "c", fetchImpl: calendarFetch });
  assert.equal(done.ok, true);
  assert.equal(done.senderId, "snd_1", "extends the SAME sender, no duplicate");
  const all = await senders.listSenders("t1");
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "active");
  assert.ok(all[0].scopes.includes("https://www.googleapis.com/auth/gmail.send"), "keeps existing send grant");
  assert.ok(all[0].scopes.includes("https://www.googleapis.com/auth/calendar.events"), "adds calendar events");
  assert.ok(all[0].scopes.includes("https://www.googleapis.com/auth/calendar.events.freebusy"), "adds freebusy");
  assert.equal(all[0].scopes.length, 4, "union, no duplicates");
  assert.equal(records.traces.size, 1, "new consent trace recorded");
  const trace = [...records.traces.values()][0];
  assert.equal(trace.scopes.length, 4);
  GMAIL_ENV_CLEAR();
});

test("consent-first send purpose on an active sender still refuses; calendar mismatch still refuses", async () => {
  GMAIL_ENV();
  const senders = memorySenders([sender({ status: "active", consentTraceId: "ctc_old", scopes: ["https://www.googleapis.com/auth/gmail.send"] })]);
  const records = memoryRecords();
  // Send purpose on active sender: 409 (no silent re-grant).
  const { state: s1 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail", purpose: "send" });
  const again = await completeConsent(senders, records, { expectedTenantId: "t1", state: s1, code: "c", fetchImpl: goodFetchFor("rep@example.com") });
  assert.equal(again.ok, false);
  assert.equal(again.status, 409);
  assert.match(again.error, /already connected/);
  // Calendar purpose with a DIFFERENT mailbox: consent-first registers that
  // mailbox as its own sender; the existing active sender is untouched.
  const { state: s2 } = createOAuthState({ tenantId: "t1", senderId: "", provider: "gmail", purpose: "calendar" });
  const calendarFetchOther = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy" }), { status: 200 });
    }
    return new Response(JSON.stringify({ email: "someoneelse@example.com" }), { status: 200 });
  };
  const other = await completeConsent(senders, records, { expectedTenantId: "t1", state: s2, code: "c", fetchImpl: calendarFetchOther });
  assert.equal(other.ok, true);
  assert.notEqual(other.senderId, "snd_1");
  const after = await senders.getSender("t1", "snd_1");
  assert.deepEqual(after.scopes, ["https://www.googleapis.com/auth/gmail.send"], "existing sender scopes untouched");
  const added = await senders.getSender("t1", other.senderId);
  assert.ok(added.scopes.every((sc) => sc.includes("calendar")), "new sender carries calendar scopes only");
  assert.equal(added.dailyCap, 0, "dispatch stays gated");
  GMAIL_ENV_CLEAR();
});
