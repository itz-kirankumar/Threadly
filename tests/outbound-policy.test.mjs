import { test } from "node:test";
import assert from "node:assert/strict";

const {
  evaluateFirstSendEligibility,
  checkDispatch,
  isMaterialChange,
  suppressionTokenFor,
  normalizeEmail,
} = await import("../src/lib/outbound/policy.ts");

const NOW = new Date("2026-10-27T12:00:00.000Z");

function okContact() {
  return {
    tenantId: "t1", contactId: "c1", accountId: "a1",
    email: "jane@acme.com", fullName: "Jane Doe",
    verification: { state: "valid", verifiedAt: "2026-10-20T00:00:00.000Z", verifier: "stub" },
    employerChangedAt: null, createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

function okRights() {
  return {
    tenantId: "t1", rightsId: "r1", contactId: "c1", sourceEvidenceId: "e1",
    intendedUse: "b2b_marketing", licensePermitsUse: true,
    subscriberClass: "corporate", lawfulBasis: "legitimate_interest", country: "US",
    createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

test("eligibility passes with complete valid inputs", () => {
  const d = evaluateFirstSendEligibility({ contact: okContact(), rights: okRights(), suppressed: false, now: NOW });
  assert.equal(d.allow, true);
});

const failCases = [
  ["missing contact", { contact: null }],
  ["missing rights", { rights: null }],
  ["suppressed", { suppressed: true }],
  ["employer changed", { contact: { ...okContact(), employerChangedAt: NOW.toISOString() } }],
  ["verification invalid", { contact: { ...okContact(), verification: { state: "invalid", verifiedAt: "2026-10-20T00:00:00.000Z", verifier: "s" } } }],
  ["verification unknown", { contact: { ...okContact(), verification: { state: "unknown", verifiedAt: null, verifier: null } } }],
  ["verification catch_all", { contact: { ...okContact(), verification: { state: "catch_all", verifiedAt: "2026-10-20T00:00:00.000Z", verifier: "s" } } }],
  ["verification stale", { contact: { ...okContact(), verification: { state: "stale", verifiedAt: "2026-10-20T00:00:00.000Z", verifier: "s" } } }],
  ["verification older than 30 days", { contact: { ...okContact(), verification: { state: "valid", verifiedAt: "2026-09-01T00:00:00.000Z", verifier: "s" } } }],
  ["verification missing timestamp", { contact: { ...okContact(), verification: { state: "valid", verifiedAt: null, verifier: "s" } } }],
  ["unlicensed source", { rights: { ...okRights(), licensePermitsUse: false } }],
  ["individual subscriber", { rights: { ...okRights(), subscriberClass: "individual" } }],
  ["unknown subscriber class", { rights: { ...okRights(), subscriberClass: "unknown" } }],
  ["missing lawful basis", { rights: { ...okRights(), lawfulBasis: null } }],
  ["missing country", { rights: { ...okRights(), country: null } }],
];

for (const [name, patch] of failCases) {
  test(`eligibility fails closed: ${name}`, () => {
    const input = { contact: okContact(), rights: okRights(), suppressed: false, now: NOW, ...patch };
    const d = evaluateFirstSendEligibility(input);
    assert.equal(d.allow, false, `expected block, got allow for ${name}`);
    assert.ok(d.reasons.length > 0);
  });
}

function okCampaign() {
  return {
    tenantId: "t1", campaignId: "camp1", version: 1,
    senderAllowlist: ["snd1"], audienceQueryVersion: "aq1", exclusions: [],
    templates: [{ step: 1, subject: "s", body: "b" }], allowedPersonalization: [],
    followUpCount: 2, countries: ["US"],
    sendWindows: [{ timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 23 }],
    dailyCapPerSender: 25, costCeiling: { currency: "USD", amount: 100000 },
    bookingPolicy: { directBooking: false, hostPool: [] },
    expiresAt: "2026-12-31T00:00:00.000Z", createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

function okApproval() {
  return {
    tenantId: "t1", approvalId: "ap1", campaignId: "camp1", campaignVersion: 1,
    approverUserId: "u1", approverRole: "campaign_approver", approvedAt: NOW.toISOString(),
    revokedAt: null, revokedBy: null, createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

function okSender() {
  return {
    tenantId: "t1", senderId: "snd1", provider: "gmail", email: "rep@tenant.com",
    status: "active", consentTraceId: "ct1", scopes: ["gmail.send"], dailyCap: 25,
    localTimezone: "UTC", createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

function okIntent() {
  return {
    tenantId: "t1", intentId: "i1", uniqueKey: "t1:e1:v1:s1", enrollmentId: "e1",
    campaignId: "camp1", campaignVersion: 1, contactId: "c1", senderId: "snd1", step: 1,
    status: "reserved", statusUpdatedAt: NOW.toISOString(), cancelReason: null,
    leaseOwner: "w1", leaseExpiresAt: "2026-10-27T12:05:00.000Z", reconciledAt: null,
    createdAt: NOW.toISOString(), createdBy: "u1",
  };
}

function okDispatch(patch = {}) {
  return {
    intent: okIntent(), campaign: okCampaign(), approval: okApproval(), sender: okSender(),
    contactSuppressed: false, enrollmentStatus: "active", humanReplySeen: false,
    senderAcceptedToday: 0, tenantCostToDate: 0, tenantCostComplete: true, now: NOW, ...patch,
  };
}

test("dispatch allowed when every gate passes", () => {
  assert.equal(checkDispatch(okDispatch()).allow, true);
  assert.ok(checkDispatch(okDispatch({ tenantCostComplete: false })).reasons.includes("tenant_cost_unknown"));
});

const dispatchBlocks = [
  ["revoked approval", { approval: { ...okApproval(), revokedAt: NOW.toISOString(), revokedBy: "u2" } }],
  ["missing approval", { approval: null }],
  ["expired campaign", { campaign: { ...okCampaign(), expiresAt: "2026-10-01T00:00:00.000Z" } }],
  ["approval version mismatch", { approval: { ...okApproval(), campaignVersion: 2 } }],
  ["sender missing", { sender: null }],
  ["sender paused", { sender: { ...okSender(), status: "paused" } }],
  ["sender revoked", { sender: { ...okSender(), status: "revoked" } }],
  ["sender not allowlisted", { campaign: { ...okCampaign(), senderAllowlist: ["other"] } }],
  ["daily cap reached", { senderAcceptedToday: 25 }],
  ["suppression landed after reservation", { contactSuppressed: true }],
  ["enrollment paused", { enrollmentStatus: "paused" }],
  ["enrollment replied", { enrollmentStatus: "replied" }],
  ["human reply seen", { humanReplySeen: true }],
  ["cost ceiling reached", { tenantCostToDate: 100000 }],
  ["intent not reserved", { intent: { ...okIntent(), status: "scheduled" } }],
  ["outside send window", { now: new Date("2026-10-27T23:30:00.000Z") }],
];

for (const [name, patch] of dispatchBlocks) {
  test(`dispatch blocked: ${name}`, () => {
    const d = checkDispatch(okDispatch(patch));
    assert.equal(d.allow, false, `expected block for ${name}`);
  });
}

test("material change detection", () => {
  const a = okCampaign();
  assert.equal(isMaterialChange(a, { ...a }), false);
  assert.equal(isMaterialChange(a, { ...a, dailyCapPerSender: 50 }), true);
  assert.equal(isMaterialChange(a, { ...a, templates: [] }), true);
  assert.equal(isMaterialChange(a, { ...a, countries: ["US", "IN"] }), true);
});

test("suppression token is a hash, never the raw email", () => {
  const token = suppressionTokenFor("t1", "  Jane@ACME.com ");
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(token.includes("jane"), false);
  assert.equal(token, suppressionTokenFor("t1", "jane@acme.com"));
  assert.notEqual(token, suppressionTokenFor("t2", "jane@acme.com"));
  assert.equal(normalizeEmail("  A@B.COM "), "a@b.com");
});
