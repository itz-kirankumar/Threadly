import { test } from "node:test";
import assert from "node:assert/strict";

// RTDB drops null-valued fields on write. These tests lock the read-side
// normalization contract: raw records missing nullable fields (exactly what
// RTDB returns) must come back with explicit nulls, because logic layers use
// strict-null comparisons for safety gates. Regression cover for bugs found
// by local HTTP+emulator e2e on 2026-10-28 (kill switch read as lifted,
// unknown-cost events read as priced, unowned conversations read as owned).

import { normalizeKillSwitch } from "../src/lib/outbound/rtdb-kill-switch-store.ts";
import { normalizeIcp } from "../src/lib/outbound/rtdb-icp-store.ts";
import { normalizeConversation, normalizeMeeting } from "../src/lib/outbound/rtdb-conversation-store.ts";
import { normalizeUsageEvent } from "../src/lib/outbound/rtdb-usage-store.ts";
import { normalizeIntent } from "../src/lib/outbound/rtdb-store.ts";
import { normalizeSource } from "../src/lib/outbound/rtdb-source-store.ts";

const base = { tenantId: "t1", createdAt: "2026-10-28T00:00:00Z", createdBy: "tester" };

test("kill switch missing liftedAt normalizes to null (still active, liftable)", () => {
  const raw = { ...base, switchId: "ks_1", scope: "campaign", target: "c1", reason: "r" }; // no liftedAt, as RTDB returns it
  assert.equal(normalizeKillSwitch(raw).liftedAt, null);
});

test("icp version missing confirmed/activated markers normalizes to nulls", () => {
  const raw = { ...base, icpVersionId: "i1", version: 1, status: "draft", sectors: [], roles: [], employeeBands: [], regions: [], exclusions: [], approvedClaims: [], source: { kind: "manual" } };
  const v = normalizeIcp(raw);
  assert.equal(v.confirmedAt, null);
  assert.equal(v.activatedAt, null);
  assert.equal(v.confirmedBy, null);
});

test("conversation missing reply/owner markers normalizes to nulls (uncertain routes to a person)", () => {
  const raw = { ...base, conversationId: "cv1", contactId: "ct1" };
  const c = normalizeConversation(raw);
  assert.equal(c.humanReplySeenAt, null);
  assert.equal(c.ownerUserId, null);
  assert.equal(c.classification, null);
  assert.equal(c.classifiedBy, null);
  assert.equal(c.enrollmentId, null);
});

test("meeting missing optional markers normalizes to nulls", () => {
  const raw = { ...base, meetingId: "m1", startsAt: "2026-10-30T10:00:00Z", timezone: "UTC", booked: true };
  const m = normalizeMeeting(raw);
  assert.equal(m.attendeeAccepted, null);
  assert.equal(m.held, null);
  assert.equal(m.conversationId, null);
  assert.equal(m.providerEventId, null);
});

test("usage event missing cost fields normalizes to null (cost gate fails closed on unknown)", () => {
  const raw = { ...base, usageId: "u1", kind: "generation", units: 1, idempotencyKey: "k" };
  const e = normalizeUsageEvent(raw);
  assert.equal(e.costMinorUnits, null);
  assert.equal(e.currency, null);
});

test("intent missing lease/cancel fields normalizes to nulls", () => {
  const raw = { ...base, intentId: "i1", uniqueKey: "t1:c1:ct1:1", campaignId: "c1", contactId: "ct1", step: 1, status: "reserved" };
  const i = normalizeIntent(raw);
  assert.equal(i.leaseExpiresAt, null);
  assert.equal(i.leaseOwner, null);
  assert.equal(i.cancelReason, null);
  assert.equal(i.reconciledAt, null);
});

test("licensed source missing revocation markers normalizes to nulls (live source not misread as revoked)", () => {
  const raw = { ...base, sourceId: "ls1", sourceName: "acme", kind: "licensed_api", licensePermitsUse: true };
  const s = normalizeSource(raw);
  assert.equal(s.revokedAt, null);
  assert.equal(s.termsUrl, null);
});
