import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Caller-level fault injection against the REAL RTDB emulator: the CAS write
// genuinely lands; HTTP fault injection forces the post-write readback to
// fail or lie. Verifies the caller outcomes parent requires:
//  - booking claim CAS landed + readback failure: no provider create, no
//    unsafe release/redeem, reconciler quarantines (never auto-retries).
//  - audit primary landed + readback failure: fallback captures the record,
//    recovery replays create-or-identical (no duplicate), tamper is refused
//    loudly (fallback preserved as evidence).

process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.OUTBOUND_DATA_ROOT = "outbound-test";

const { selectSlot, createBookingLink, hashBookingToken } = await import("../src/lib/outbound/booking-flow.ts");
const { MockCalendarAdapter } = await import("../src/lib/outbound/providers/calendar.ts");
const { MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");
const { RtdbBookingStore, RtdbOperationIntentStore } = await import("../src/lib/outbound/rtdb-booking-store.ts");
const { RtdbAuditStore } = await import("../src/lib/outbound/rtdb-audit-store.ts");
const { reconcileBookingIntents } = await import("../src/lib/outbound/operation-intents.ts");
const { auditEvent } = await import("../src/lib/outbound/audit.ts");
const { getAdminDatabase } = await import("../src/lib/geo/admin-store.ts");

const realFetch = globalThis.fetch;
const NOW = new Date("2026-11-02T08:00:00Z");
const TENANT = `tf_${Date.now().toString(36)}`;

// Fault switch: when armed, the readback GET (the GET WITHOUT the
// X-Firebase-ETag header, which only the CAS initial read sets) on a matching
// path returns the injected response instead of hitting the emulator.
let fault = null; // { pathIncludes: string, respond: (url) => Response }
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = init.method ?? "GET";
  const isReadbackGet = method === "GET" && !init.headers?.["X-Firebase-ETag"];
  if (fault && isReadbackGet && u.includes(fault.pathIncludes)) return fault.respond(u);
  return realFetch(url, init);
};
const jsonRes = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function stores({ links, intents }) {
  const policies = new Map([["bpo_1", {
    tenantId: TENANT, policyId: "bpo_1", hostPool: ["snd_1"], durationMinutes: 30, bufferMinutes: 0,
    workingHours: { timezone: "UTC", days: [1, 2, 3, 4, 5], startHour: 9, endHour: 12 },
    directBooking: false, createdAt: "2026-10-26T00:00:00Z", createdBy: "u1",
  }]]);
  return {
    conversations: new MemoryConversationStore(),
    intents,
    links,
    policies: {
      async savePolicy(p) { policies.set(p.policyId, p); },
      async getPolicy(t, id) { const p = policies.get(id); return p && p.tenantId === t ? p : null; },
      async listPolicies(t) { return [...policies.values()].filter((p) => p.tenantId === t); },
    },
    contacts: { async getContact(t, id) { return { tenantId: t, contactId: id, email: "prospect@example.com" }; } },
    senders: { async getSender(t, id) { return { tenantId: t, senderId: id, provider: "gmail", email: "rep@example.com", status: "pending_consent" }; } },
  };
}

async function makeLink(s, tag) {
  const created = await createBookingLink(s, {
    tenantId: TENANT, conversationId: null, contactId: `ct_${tag}`, organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  return created.token;
}

after(async () => {
  // Release the admin SDK emulator connection so the test process exits.
  const { getApps } = await import("firebase-admin/app");
  await Promise.all(getApps().map((a) => a.delete()));
});

before(async () => {
  const res = await realFetch("http://127.0.0.1:9000/.json?ns=demo-threadly");
  assert.equal(res.status, 200, "RTDB emulator must be running on 127.0.0.1:9000");
});

test("claim CAS landed + readback mismatch: no provider create, no unsafe redeem, reconciler quarantines without auto-retry", async () => {
  const links = new RtdbBookingStore();
  const intents = new RtdbOperationIntentStore();
  const s = stores({ links, intents });
  const adapter = new MockCalendarAdapter();
  let providerCalls = 0;
  adapter.createEvent = async () => { providerCalls++; return { providerEventId: "mockcal_fault" }; };
  const token = await makeLink(s, "a");
  const tokenHash = hashBookingToken(token);

  // Arm: the readback GET replays the PRE-CLAIM record (as if the claim had
  // not persisted), while the PUT genuinely lands in the emulator.
  let preClaimBody = null;
  const wrapFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if ((init.method ?? "GET") === "GET" && init.headers?.["X-Firebase-ETag"] && u.includes("bookingLinksByToken")) {
      const res = await realFetch(url, init);
      preClaimBody = await res.clone().json();
      return res;
    }
    return wrapFetch(url, init);
  };
  fault = { pathIncludes: "bookingLinksByToken", respond: () => jsonRes(200, preClaimBody) };

  await assert.rejects(
    () => selectSlot(s, { adapter, accessToken: null }, { token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW }),
    /cas_readback_mismatch/
  );
  fault = null;
  globalThis.fetch = wrapFetch;

  assert.equal(providerCalls, 0, "no provider event may be created when the claim could not be verified");
  const landed = await links.getLinkByTokenHash(tokenHash);
  assert.equal(landed.claimState, "claiming", "the CAS landed: the link IS claimed despite the failed readback");
  assert.ok(landed.claimedAt, "claimedAt stamp present for the reconciler");

  // No unsafe redeem: a retry hits the landed claim and is refused.
  const retry = await selectSlot(s, { adapter, accessToken: null }, { token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(retry.ok, false);
  assert.equal(retry.status, 409);
  assert.equal(providerCalls, 0);

  // Reconciler inside the stale window: in-flight protection, nothing touched.
  const early = await reconcileBookingIntents({ links, intents }, TENANT, { now: new Date(Date.parse(landed.claimedAt) + 1000), staleMs: 60000 });
  assert.deepEqual(early, { quarantinedLinks: 0, quarantinedIntents: 0 });

  // Reconciler past the stale window: quarantined, never auto-retried.
  const late = await reconcileBookingIntents({ links, intents }, TENANT, { now: new Date(Date.parse(landed.claimedAt) + 120000), staleMs: 60000 });
  assert.deepEqual(late, { quarantinedLinks: 1, quarantinedIntents: 0 });
  const after = await links.getLinkByTokenHash(tokenHash);
  assert.equal(after.claimState, "claim_unknown");
  assert.match(after.claimError, /reconciler/);

  // Quarantine is terminal: no automatic retry path reclaims it.
  const afterQuarantine = await selectSlot(s, { adapter, accessToken: null }, { token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(afterQuarantine.ok, false);
  assert.equal(afterQuarantine.status, 409);
  assert.equal(providerCalls, 0);
});

test("audit primary landed + readback failed: degraded fallback, idempotent recovery, tamper refused", async () => {
  const links = new RtdbBookingStore();
  const intents = new RtdbOperationIntentStore();
  const audit = new RtdbAuditStore();
  const s = stores({ links, intents });
  const adapter = new MockCalendarAdapter();
  const token = await makeLink(s, "b");

  // Arm: the audit readback GET fails with 500 AFTER the PUT lands.
  fault = { pathIncludes: "/audit/", respond: () => jsonRes(500, {}) };
  const result = await selectSlot(s, { adapter, accessToken: null }, { token, startISO: "2026-11-02T09:30:00.000Z", actor: "recipient", now: NOW, audit });
  fault = null;

  assert.equal(result.ok, true, "a lost audit confirmation must not mask the committed booking");
  const database = await getAdminDatabase();
  const base = `outbound-test/${TENANT}`;
  const primarySnap = await database.ref(`${base}/audit`).get();
  const fallbackSnap = await database.ref(`${base}/auditFallback`).get();
  assert.equal(primarySnap.exists(), true, "the primary audit write LANDED despite the failed readback");
  assert.equal(fallbackSnap.exists(), true, "the degraded fallback captured the same event");
  const primaryEvents = Object.values(primarySnap.val());
  const committed = primaryEvents.filter((e) => e.action === "booking.committed");
  assert.equal(committed.length, 1);
  const eventId = committed[0].eventId;
  const fallbackEvents = Object.values(fallbackSnap.val());
  assert.equal(fallbackEvents.length, 1);
  assert.equal(fallbackEvents[0].event.eventId, eventId);

  // Recovery: fallback replays into the landed primary create-or-identical.
  const rec = await audit.recoverDegraded(TENANT);
  assert.deepEqual(rec, { recovered: 1, remaining: 0 });
  const afterRec = await database.ref(`${base}/audit`).get();
  assert.equal(Object.values(afterRec.val()).filter((e) => e.eventId === eventId).length, 1, "no duplicate audit event after replay");
  assert.equal((await database.ref(`${base}/auditFallback`).get()).exists(), false);

  // Tamper: primary holds DIFFERENT content under the same eventId; a fresh
  // fallback record for that eventId must be PRESERVED, never overwrite.
  const tampered = { ...committed[0], outcome: "failure", detail: "tampered" };
  await database.ref(`${base}/audit/${eventId}`).set(tampered);
  await database.ref(`${base}/auditFallback/${eventId}`).set({ event: committed[0], cause: "test re-landed" });
  const rec2 = await audit.recoverDegraded(TENANT);
  assert.equal(rec2.recovered, 0, "conflicting replay is refused");
  assert.equal(rec2.remaining, 1, "conflicting fallback record preserved as evidence");
  const primaryAfter = await database.ref(`${base}/audit/${eventId}`).get();
  assert.equal(primaryAfter.val().outcome, "failure", "primary content never overwritten by a differing replay");
});
