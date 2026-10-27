import { test } from "node:test";
import assert from "node:assert/strict";

const { createBookingLink, selectSlot } = await import("../src/lib/outbound/booking-flow.ts");
const { MockCalendarAdapter } = await import("../src/lib/outbound/providers/calendar.ts");
const { MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");
const { MemoryOperationIntentStore, reconcileBookingIntents } = await import("../src/lib/outbound/operation-intents.ts");

const NOW = new Date("2026-11-02T08:00:00Z"); // Monday

function stores({ intents, events = null } = {}) {
  const links = new Map();
  const policies = new Map([["bpo_1", {
    tenantId: "t1", policyId: "bpo_1", hostPool: ["snd_1"], durationMinutes: 30, bufferMinutes: 0,
    workingHours: { timezone: "UTC", days: [1, 2, 3, 4, 5], startHour: 9, endHour: 12 },
    directBooking: false, createdAt: "2026-10-26T00:00:00Z", createdBy: "u1",
  }]]);
  return {
    conversations: new MemoryConversationStore(),
    intents,
    policies: {
      async savePolicy(p) { policies.set(p.policyId, p); },
      async getPolicy(t, id) { const p = policies.get(id); return p && p.tenantId === t ? p : null; },
      async listPolicies(t) { return [...policies.values()].filter((p) => p.tenantId === t); },
    },
    links: {
      async saveLink(l) { links.set(l.tokenHash, l); },
      async getLinkByTokenHash(h) { return links.get(h) ?? null; },
      async updateLink(l) { links.set(l.tokenHash, l); },
      async claimLink(l) {
        const current = links.get(l.tokenHash);
        if (!current || current.usedAt != null || current.claimState != null) return false;
        links.set(l.tokenHash, { ...current, claimState: "claiming", claimedAt: new Date().toISOString() });
        return true;
      },
      async releaseLinkClaim(l) { links.set(l.tokenHash, { ...links.get(l.tokenHash), claimState: null, claimedAt: null }); },
      async markClaimUnknown(l, e) { links.set(l.tokenHash, { ...links.get(l.tokenHash), claimState: "claim_unknown", claimError: e ?? null }); },
      async listLinks(tenantId) { return [...links.values()].filter((l) => l.tenantId === tenantId); },
    },
    contacts: { async getContact(t, id) { return { tenantId: t, contactId: id, email: "prospect@example.com" }; } },
    senders: { async getSender(t, id) { return { tenantId: t, senderId: id, provider: "gmail", email: "rep@example.com", status: "pending_consent" }; } },
    _links: links,
  };
}

async function makeLink(s) {
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  return created.token;
}

test("commit intent is recorded BEFORE the provider call and completed on success", async () => {
  const order = [];
  const intents = new MemoryOperationIntentStore();
  const origPut = intents.putIntent.bind(intents);
  intents.putIntent = async (i) => { order.push("intent"); return origPut(i); };
  const s = stores({ intents });
  const adapter = new MockCalendarAdapter();
  const origCreate = adapter.createEvent.bind(adapter);
  adapter.createEvent = async (...a) => { order.push("provider"); return origCreate(...a); };
  const token = await makeLink(s);
  const result = await selectSlot(s, { adapter, accessToken: null }, { token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(order, ["intent", "provider"], "durable intent precedes the provider effect");
  const recorded = await intents.listIntents("t1");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].state, "completed");
  assert.equal(recorded[0].kind, "booking.commit");
  assert.ok(recorded[0].resolvedAt);
  assert.equal(recorded[0].payload.startISO, "2026-11-02T09:00:00.000Z");
  assert.match(recorded[0].payload.tokenHash, /^[0-9a-f]{64}$/, "payload carries the hash, never the token");
});

test("provider failure quarantines both the intent and the claim", async () => {
  const intents = new MemoryOperationIntentStore();
  const s = stores({ intents });
  const adapter = new MockCalendarAdapter();
  adapter.createEvent = async () => { throw new Error("provider timeout"); };
  const token = await makeLink(s);
  const result = await selectSlot(s, { adapter, accessToken: null }, { token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(result.status, 502);
  const recorded = await intents.listIntents("t1");
  assert.equal(recorded[0].state, "quarantined");
  assert.match(recorded[0].error, /provider timeout/);
  const link = [...s._links.values()][0];
  assert.equal(link.claimState, "claim_unknown");
});

test("putIntent is create-or-identical: identical replay no-ops, differing content throws", async () => {
  const intents = new MemoryOperationIntentStore();
  const base = { tenantId: "t1", opId: "opi_1", kind: "booking.commit", state: "intent", payload: { tokenHash: "abc" }, createdAt: NOW.toISOString(), resolvedAt: null, error: null };
  await intents.putIntent(base);
  await intents.putIntent({ ...base });
  await assert.rejects(() => intents.putIntent({ ...base, payload: { tokenHash: "different" } }), /operation_intent_conflict/);
  // CAS transition: wrong from-state refuses
  assert.equal(await intents.transitionIntent("t1", "opi_1", "completed", "quarantined"), false);
  assert.equal(await intents.transitionIntent("t1", "opi_1", "intent", "quarantined", "x"), true);
  assert.equal(await intents.transitionIntent("t1", "opi_1", "intent", "completed"), false, "already resolved");
});

test("reconciler quarantines stale claims and stale intents, leaves fresh ones, stays tenant-scoped", async () => {
  const intents = new MemoryOperationIntentStore();
  const s = stores({ intents });
  const old = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
  // stale claiming link (crash between claim and intent write)
  await makeLink(s);
  const staleLink = [...s._links.values()][0];
  s._links.set(staleLink.tokenHash, { ...staleLink, claimState: "claiming", claimedAt: old });
  // fresh claiming link (in-flight right now): untouched
  await makeLink(s);
  const freshLink = [...s._links.values()][1];
  s._links.set(freshLink.tokenHash, { ...freshLink, claimState: "claiming", claimedAt: NOW.toISOString() });
  // stale + fresh intents; other-tenant stale intent
  await intents.putIntent({ tenantId: "t1", opId: "opi_stale", kind: "booking.commit", state: "intent", payload: {}, createdAt: old, resolvedAt: null, error: null });
  await intents.putIntent({ tenantId: "t1", opId: "opi_fresh", kind: "booking.commit", state: "intent", payload: {}, createdAt: NOW.toISOString(), resolvedAt: null, error: null });
  await intents.putIntent({ tenantId: "t2", opId: "opi_other", kind: "booking.commit", state: "intent", payload: {}, createdAt: old, resolvedAt: null, error: null });

  const result = await reconcileBookingIntents({ links: s.links, intents }, "t1", { now: NOW, staleMs: 10 * 60 * 1000 });
  assert.deepEqual(result, { quarantinedLinks: 1, quarantinedIntents: 1 });
  assert.equal([...s._links.values()][0].claimState, "claim_unknown");
  assert.match([...s._links.values()][0].claimError, /reconciler/);
  assert.equal([...s._links.values()][1].claimState, "claiming", "fresh claim untouched");
  assert.equal((await intents.getIntent("t1", "opi_stale")).state, "quarantined");
  assert.equal((await intents.getIntent("t1", "opi_fresh")).state, "intent");
  assert.equal((await intents.getIntent("t2", "opi_other")).state, "intent", "other tenant untouched");
});
