import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryAuditStore, auditEvent } from "../src/lib/outbound/audit.ts";

const ev = (tenantId, action = "booking.committed") => auditEvent({ tenantId, actor: "u1", action, target: "meeting:mtg_1", outcome: "success", detail: null });

test("degraded records replay into the primary log on recovery", async () => {
  const store = new MemoryAuditStore();
  const event = ev("t1");
  await store.appendDegraded(event, "primary down");
  assert.equal((await store.list("t1")).length, 0);
  const result = await store.recoverDegraded("t1");
  assert.deepEqual(result, { recovered: 1, remaining: 0 });
  const listed = await store.list("t1");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].eventId, event.eventId);
  assert.equal(store.degraded.length, 0);
});

test("recovery is idempotent: a second sweep does not duplicate the event", async () => {
  const store = new MemoryAuditStore();
  const event = ev("t1");
  await store.appendDegraded(event, "primary down");
  await store.recoverDegraded("t1");
  await store.appendDegraded(event, "removal failed before clearing"); // same eventId re-landed
  await store.recoverDegraded("t1");
  assert.equal((await store.list("t1")).filter((e) => e.eventId === event.eventId).length, 1);
});

test("recovery is tenant-scoped and respects the limit", async () => {
  const store = new MemoryAuditStore();
  await store.appendDegraded(ev("t1", "a"), "x");
  await store.appendDegraded(ev("t1", "b"), "x");
  await store.appendDegraded(ev("t2", "c"), "x");
  const result = await store.recoverDegraded("t1", 1);
  assert.deepEqual(result, { recovered: 1, remaining: 1 });
  assert.equal((await store.list("t1")).length, 1);
  assert.equal((await store.list("t2")).length, 0);
});

test("booking commit writes a degraded audit record when the primary append fails after commit", async () => {
  const { createBookingLink, selectSlot } = await import("../src/lib/outbound/booking-flow.ts");
  const { MockCalendarAdapter } = await import("../src/lib/outbound/providers/calendar.ts");
  const { MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");
  const { MemoryAuditStore: MAS } = await import("../src/lib/outbound/audit.ts");

  const audit = new MAS();
  audit.append = async () => { throw new Error("rtdb unreachable"); };

  const links = new Map();
  const policies = new Map([["bpo_1", {
    tenantId: "t1", policyId: "bpo_1", hostPool: ["snd_1"], durationMinutes: 30, bufferMinutes: 0,
    workingHours: { timezone: "UTC", days: [1, 2, 3, 4, 5], startHour: 9, endHour: 12 },
    directBooking: false, createdAt: "2026-10-26T00:00:00Z", createdBy: "u1",
  }]]);
  const s = {
    conversations: new MemoryConversationStore(),
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
    contacts: { async getContact(t, id) { return { tenantId: t, contactId: id, email: "prospect@example.com" }; } },
    senders: { async getSender(t, id) { return { tenantId: t, senderId: id, provider: "gmail", email: "rep@example.com", status: "pending_consent" }; } },
  };
  const calendar = { adapter: new MockCalendarAdapter(), accessToken: null };
  const NOW = new Date("2026-11-02T08:00:00Z");
  const created = await createBookingLink(s, {
    tenantId: "t1", conversationId: null, contactId: "ct_1", organizerSenderId: "snd_1", policyId: "bpo_1", actor: "u1",
  });
  const result = await selectSlot(s, calendar, { token: created.token, startISO: "2026-11-02T09:00:00.000Z", actor: "recipient", now: NOW, audit });
  assert.equal(result.ok, true);
  assert.equal(audit.degraded.length, 1, "audit record must land on the degraded path, not be lost");
  assert.match(audit.degraded[0].cause, /rtdb unreachable/);
  const rec = await audit.recoverDegraded("t1");
  assert.deepEqual(rec, { recovered: 1, remaining: 0 });
  assert.equal((await audit.list("t1")).length, 1);
});

test("keyed write refuses to overwrite an existing eventId with different content", async () => {
  const store = new MemoryAuditStore();
  const event = ev("t1");
  await store.append(event);
  const tampered = { ...event, outcome: "denied", detail: "rewritten" };
  await assert.rejects(() => store.append(tampered), /audit_event_conflict/);
  const listed = await store.list("t1");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].outcome, "success", "original record survives the overwrite attempt");
});

test("keyed write accepts an identical replay (create-or-identical semantics)", async () => {
  const store = new MemoryAuditStore();
  const event = ev("t1");
  await store.append(event);
  await store.append({ ...event }); // byte-identical replay
  assert.equal((await store.list("t1")).length, 1);
});

test("comparison treats a dropped null detail as equal (RTDB null-dropping)", async () => {
  const { sameAuditEvent } = await import("../src/lib/outbound/audit.ts");
  const event = ev("t1"); // detail: null
  const readBack = { ...event };
  delete readBack.detail; // RTDB drops null fields on write
  assert.equal(sameAuditEvent(event, readBack), true);
  assert.equal(sameAuditEvent(event, { ...event, detail: "x" }), false);
  assert.equal(sameAuditEvent(event, { ...event, at: "2026-01-01T00:00:00.000Z" }), false);
});

test("tenant isolation: the same eventId under two tenants is independent, and recovery stays tenant-scoped", async () => {
  const store = new MemoryAuditStore();
  const a = ev("t1");
  const b = { ...ev("t2"), eventId: a.eventId }; // same id, other tenant, other content
  await store.append(a);
  await store.append(b); // memory store scopes conflict checks per stored record; cross-tenant reuse must not throw here
  await store.appendDegraded(ev("t1", "c"), "x");
  await store.appendDegraded(ev("t2", "d"), "x");
  const r1 = await store.recoverDegraded("t1");
  assert.deepEqual(r1, { recovered: 1, remaining: 0 });
  assert.equal((await store.list("t2")).filter((e) => e.action === "d").length, 0, "t2 fallback untouched by t1 sweep");
  const r2 = await store.recoverDegraded("t2");
  assert.deepEqual(r2, { recovered: 1, remaining: 0 });
});
