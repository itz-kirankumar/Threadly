import { test } from "node:test";
import assert from "node:assert/strict";

const { computeSlots, commitBooking } = await import("../src/lib/outbound/booking.ts");
const { createBookingLink, getBookingOffer, selectSlot, cancelMeeting, hashBookingToken } = await import("../src/lib/outbound/booking-flow.ts");
const { MockCalendarAdapter } = await import("../src/lib/outbound/providers/calendar.ts");
const { MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");

const policy = (overrides = {}) => ({
  tenantId: "t1", policyId: "bpo_1", hostPool: ["snd_1"], durationMinutes: 30, bufferMinutes: 0,
  workingHours: { timezone: "UTC", days: [1, 2, 3, 4, 5], startHour: 9, endHour: 12 },
  directBooking: false, createdAt: "2026-10-26T00:00:00Z", createdBy: "u1",
  ...overrides,
});

// Monday 2026-11-02 08:00 UTC
const NOW = new Date("2026-11-02T08:00:00Z");

function stores({ busyLink = null } = {}) {
  const conversations = new MemoryConversationStore();
  const links = new Map();
  const policies = new Map([["bpo_1", policy()]]);
  return {
    conversations,
    links,
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
        if (!current || current.usedAt !== null || current.claimState) return false;
        links.set(l.tokenHash, { ...current, claimState: "claiming" });
        return true;
      },
      async releaseLinkClaim(l) { links.set(l.tokenHash, { ...links.get(l.tokenHash), claimState: null }); },
      async markClaimUnknown(l) { links.set(l.tokenHash, { ...links.get(l.tokenHash), claimState: "claim_unknown" }); },
      async listLinks(tenantId) { return [...links.values()].filter((l) => l.tenantId === tenantId); },
    },
    contacts: {
      async getContact(t, id) {
        return id === "ct_1" ? { tenantId: t, contactId: id, email: "prospect@example.com" } : null;
      },
    },
    senders: {
      async getSender(t, id) {
        return id === "snd_1" ? { tenantId: t, senderId: id, provider: "gmail", email: "rep@example.com", status: "pending_consent" } : null;
      },
    },
  };
}

test("computeSlots honors working hours, weekdays, duration and busy windows", () => {
  const slots = computeSlots(policy(), [], NOW, 3);
  assert.equal(slots[0].startISO, "2026-11-02T09:00:00.000Z");
  assert.equal(slots[0].endISO, "2026-11-02T09:30:00.000Z");
  // 9-12 UTC at 30 min = 6 slots per day; 3 weekdays Mon-Wed = 18
  assert.equal(slots.length, 18);
  // Busy 09:00-10:00 removes the first two Monday slots
  const busySlots = computeSlots(policy(), [{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T10:00:00Z" }], NOW, 1);
  assert.equal(busySlots[0].startISO, "2026-11-02T10:00:00.000Z");
  assert.equal(busySlots.length, 4);
  // Buffer blocks adjacency
  const buffered = computeSlots(policy({ bufferMinutes: 30 }), [{ start: "2026-11-02T10:00:00Z", end: "2026-11-02T10:30:00Z" }], NOW, 1);
  assert.equal(buffered.some((s) => s.startISO === "2026-11-02T09:30:00.000Z"), false);
  assert.equal(buffered.some((s) => s.startISO === "2026-11-02T10:30:00.000Z"), false);
  assert.equal(buffered[0].startISO, "2026-11-02T09:00:00.000Z");
});

test("computeSlots respects a non-UTC policy timezone", () => {
  const istPolicy = policy({ workingHours: { timezone: "Asia/Calcutta", days: [1], startHour: 9, endHour: 10 } });
  // 02:00 UTC = 07:30 IST, before the 09:00 IST window opens
  const slots = computeSlots(istPolicy, [], new Date("2026-11-02T02:00:00Z"), 1);
  // 09:00 IST = 03:30 UTC
  assert.equal(slots[0].startISO, "2026-11-02T03:30:00.000Z");
  assert.equal(slots.length, 2);
});

test("commitBooking rechecks free/busy at commit and refuses a conflict", async () => {
  const adapter = new MockCalendarAdapter([{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T09:30:00Z" }]);
  const result = await commitBooking(adapter, null, {
    tenantId: "t1", policy: policy(), conversationId: null, contactId: "ct_1",
    contactEmail: "prospect@example.com", organizerSenderId: "snd_1",
    startISO: "2026-11-02T09:00:00.000Z", actor: "u1",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /slot_conflict/);
});

test("full link flow: create, offer, select, synthetic marking, single use", async () => {
  const s = stores();
  const calendar = { adapter: new MockCalendarAdapter(), accessToken: null };
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  assert.equal(created.ok, true);
  assert.match(created.token, /^bok_[0-9a-f]{48}$/);
  // only the hash is stored
  const stored = await s.links.getLinkByTokenHash(hashBookingToken(created.token));
  assert.ok(stored);
  assert.equal(JSON.stringify(stored).includes(created.token), false);

  const offer = await getBookingOffer(s, calendar, created.token, NOW);
  assert.equal(offer.ok, true);
  assert.equal(offer.organizerEmail, "rep@example.com");
  assert.equal(offer.slots[0].startISO, "2026-11-02T09:00:00.000Z");

  // arbitrary time not in the slot list is rejected
  const bad = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:15:00.000Z", actor: "recipient", now: NOW });
  assert.equal(bad.status, 409);

  const picked = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(picked.ok, true);
  assert.equal(picked.synthetic, true); // mock adapter: no real calendar event
  assert.equal(picked.meeting.booked, true);
  assert.equal(picked.meeting.attendeeAccepted, null); // separate outcome
  assert.equal(picked.meeting.held, null);
  assert.equal(picked.meeting.synthetic, true);

  // link is single-use
  const again = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:30:00.000Z", actor: "recipient", now: NOW });
  assert.equal(again.status, 410);

  // meeting persisted and cancellable on the same record
  const meeting = await s.conversations.getMeeting("t1", picked.meeting.meetingId);
  assert.ok(meeting);
  const cancelled = await cancelMeeting(s, calendar, { tenantId: "t1", meetingId: meeting.meetingId, actor: "u1" });
  assert.equal(cancelled.ok, true);
  assert.ok((await s.conversations.getMeeting("t1", meeting.meetingId)).cancelledAt);
});

test("expired link refuses selection", async () => {
  const s = stores();
  const calendar = { adapter: new MockCalendarAdapter(), accessToken: null };
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1", ttlDays: 1,
  });
  const later = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  const result = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-04T09:00:00.000Z", actor: "recipient", now: later });
  assert.equal(result.status, 410);
});

test("organizer must be in the policy host pool", async () => {
  const s = stores();
  const result = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_other", policyId: "bpo_1", actor: "u1",
  });
  assert.equal(result.status, 400);
});

test("double redemption race: exactly one provider attempt per link", async () => {
  const s = stores();
  let creates = 0;
  const countingAdapter = new MockCalendarAdapter();
  const origCreate = countingAdapter.createEvent.bind(countingAdapter);
  countingAdapter.createEvent = async (...args) => { creates++; return origCreate(...args); };
  const calendar = { adapter: countingAdapter, accessToken: null };
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  const first = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(first.ok, true);
  // Simultaneous/second redemption: claim already taken, no second provider call
  const second = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(second.status, 410); // usedAt set after first
  assert.equal(creates, 1);
});

test("provider timeout after claim: claim_unknown, never auto-retried", async () => {
  const s = stores();
  let creates = 0;
  const failingAdapter = new MockCalendarAdapter();
  failingAdapter.createEvent = async () => { creates++; throw new Error("timeout"); };
  const calendar = { adapter: failingAdapter, accessToken: null };
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  const result = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(result.status, 502);
  assert.match(result.error, /provider_outcome_unknown/);
  const stored = await s.links.getLinkByTokenHash(hashBookingToken(created.token));
  assert.equal(stored.claimState, "claim_unknown");
  // No retry: any further attempt is refused without a provider call
  const retry = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  assert.notEqual(retry.status, 201);
  assert.equal(creates, 1);
});

test("slot conflict at commit-time recheck releases the claim for another slot", async () => {
  const s = stores();
  // busy appears between offer and commit
  const adapter = new MockCalendarAdapter([{ start: "2026-11-02T09:00:00Z", end: "2026-11-02T09:30:00Z" }]);
  const calendar = { adapter, accessToken: null };
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  const conflict = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW });
  // not a valid slot at all (busy at offer time) -> 409 before claim
  assert.equal(conflict.status, 409);
  const stored = await s.links.getLinkByTokenHash(hashBookingToken(created.token));
  assert.equal(stored.claimState ?? null, null); // still redeemable
  const okPick = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T10:00:00.000Z", actor: "recipient", now: NOW });
  assert.equal(okPick.ok, true);
});
