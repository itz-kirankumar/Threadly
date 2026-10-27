import { test } from "node:test";
import assert from "node:assert/strict";

const { MxVerifier, applyVerificationOutcome } = await import("../src/lib/outbound/verification.ts");
const { isExcludedByIcp } = await import("../src/lib/outbound/icp.ts");

const NOW = new Date("2026-10-28T12:00:00Z");
const contact = (state) => ({
  tenantId: "t1", contactId: "ct1", accountId: "ac1", email: "ada@corp.example", fullName: "Ada",
  verification: { state, verifiedAt: null, verifier: null }, employerChangedAt: null,
  createdAt: NOW.toISOString(), createdBy: "u1",
});
const mxResolver = (records) => ({ async resolveMx() { return records; } });

test("MX verifier: no MX downgrades to invalid with an honest reason", async () => {
  const v = new MxVerifier(mxResolver([]));
  const out = await v.verify("ada@dead.example");
  assert.equal(out.state, "invalid");
  assert.match(out.detail, /no MX record/);
});

test("MX verifier: MX present is inconclusive - unknown, mailbox unproven, never valid", async () => {
  const v = new MxVerifier(mxResolver([{ exchange: "mail.corp.example", priority: 10 }]));
  const out = await v.verify("ada@corp.example");
  assert.equal(out.state, "unknown");
  assert.match(out.detail, /mailbox existence unproven/);
});

test("MX verifier: malformed email is invalid without a resolver call", async () => {
  const v = new MxVerifier(mxResolver([{ exchange: "x", priority: 1 }]));
  assert.equal((await v.verify("no-at-sign")).state, "invalid");
});

test("outcome application: invalid always lands; inconclusive never upgrades stronger negatives", () => {
  const invalid = applyVerificationOutcome(contact("unknown"), { state: "invalid", detail: "no MX" }, "mx-check", NOW);
  assert.equal(invalid.verification.state, "invalid");
  assert.equal(invalid.verification.verifier, "mx-check");
  assert.ok(invalid.verification.verifiedAt);
  // MX-present outcome must not resurrect invalid/catch_all/stale
  for (const s of ["invalid", "catch_all", "stale"]) {
    const kept = applyVerificationOutcome(contact(s), { state: "unknown", detail: "mx present" }, "mx-check", NOW);
    assert.equal(kept.verification.state, s);
    assert.ok(kept.verification.verifiedAt); // check recorded
  }
  // and "valid" is never produced by this adapter's outcomes
  const still = applyVerificationOutcome(contact("unknown"), { state: "unknown", detail: "mx present" }, "mx-check", NOW);
  assert.equal(still.verification.state, "unknown");
});

test("ICP exclusions: exact domain, account domain and keyword matches block; non-matches pass", () => {
  assert.deepEqual(isExcludedByIcp(["competitor.example"], { email: "a@competitor.example" }), { excluded: true, matched: "competitor.example" });
  assert.deepEqual(isExcludedByIcp(["competitor.example"], { email: "a@other.example", accountDomain: "competitor.example" }), { excluded: true, matched: "competitor.example" });
  assert.equal(isExcludedByIcp(["bank"], { email: "a@bigbank.example" }).excluded, true); // keyword
  assert.equal(isExcludedByIcp(["Bank"], { email: "a@bigbank.example" }).excluded, true); // case-insensitive
  assert.equal(isExcludedByIcp(["competitor.example"], { email: "a@acme.example", accountDomain: "acme.example" }).excluded, false);
  assert.equal(isExcludedByIcp([], { email: "a@acme.example" }).excluded, false);
  assert.equal(isExcludedByIcp(["  "], { email: "a@acme.example" }).excluded, false);
});
