import { test } from "node:test";
import assert from "node:assert/strict";

const { computeFitScore, MemoryFitScoreStore, DEFAULT_FIT_SCORE_CONFIG } = await import("../src/lib/outbound/scoring.ts");

const NOW = new Date("2026-10-28T12:00:00Z");
const DAY = 86_400_000;
const iso = (d) => new Date(d).toISOString();

const contact = {
  tenantId: "t1", contactId: "ct1", accountId: "ac1",
  email: "ada@corp.example", fullName: "Ada", title: "Head of Sales",
  verification: { state: "valid", verifiedAt: null, verifier: null },
  employerChangedAt: null, createdAt: iso(NOW), createdBy: "u1",
};
const account = {
  tenantId: "t1", accountId: "ac1", name: "Corp", domain: "corp.example",
  employeeBand: "51-200", region: "IN", sector: "SaaS",
  createdAt: iso(NOW), createdBy: "u1",
};
function ev(over) {
  return {
    tenantId: "t1", evidenceId: over.evidenceId, accountId: "ac1",
    kind: "licensed_api", sourceName: "testsrc",
    acquiredAt: iso(NOW), observedAt: iso(NOW),
    inference: "x", uncertainty: "fact",
    createdAt: iso(NOW), createdBy: "u1", ...over,
  };
}
const targetAll = { roles: ["sales"], regions: ["in"], employeeBands: ["51-200"], sectors: ["saas"] };
const fullEvidence = [
  ev({ evidenceId: "e1", field: "title", contactId: "ct1" }),
  ev({ evidenceId: "e2", field: "region" }),
  ev({ evidenceId: "e3", field: "employeeBand" }),
  ev({ evidenceId: "e4", field: "sector" }),
];

test("all criteria matched with fresh evidence scores 1.0 and links dated evidence + version", () => {
  const r = computeFitScore({ contact, account, evidence: fullEvidence, target: targetAll, now: NOW, actor: "u1" });
  assert.equal(r.score, 1);
  assert.deepEqual(r.coverage, { known: 4, total: 4 });
  assert.equal(r.scoreVersion, DEFAULT_FIT_SCORE_CONFIG.version);
  for (const reason of r.reasons) {
    assert.equal(reason.state, "matched");
    assert.ok(reason.evidenceId);
    assert.ok(reason.evidenceObservedAt);
    assert.equal(reason.evidenceAgeDays, 0);
    assert.equal(reason.freshnessFactor, 1);
    assert.equal(reason.contribution, reason.weight);
  }
});

test("missing evidence is unknown, never invented: excluded from score, reported with null fields", () => {
  const r = computeFitScore({ contact, account, evidence: [fullEvidence[0]], target: targetAll, now: NOW, actor: "u1" });
  // only role is known; score over known criteria only
  assert.equal(r.score, 1);
  assert.deepEqual(r.coverage, { known: 1, total: 4 });
  const unknown = r.reasons.filter((x) => x.state === "unknown");
  assert.equal(unknown.length, 3);
  for (const u of unknown) {
    assert.equal(u.contribution, null);
    assert.equal(u.evidenceId, null);
    assert.match(u.detail, /unknown, not zero/);
  }
});

test("no dated evidence at all yields score null (unknown), not zero", () => {
  const r = computeFitScore({ contact, account, evidence: [], target: targetAll, now: NOW, actor: "u1" });
  assert.equal(r.score, null);
  assert.deepEqual(r.coverage, { known: 0, total: 4 });
});

test("mismatched known criterion drags the score down within the known set", () => {
  const r = computeFitScore({
    contact, account: { ...account, region: "US" },
    evidence: [fullEvidence[0], fullEvidence[1]], target: targetAll, now: NOW, actor: "u1",
  });
  // role 4 matched, region 2 mismatched => 4/6
  assert.equal(r.score, 0.6667);
  assert.deepEqual(r.coverage, { known: 2, total: 4 });
});

test("stale evidence decays contribution by the half-life and lowers the score", () => {
  const stale = ev({ evidenceId: "e1", field: "title", contactId: "ct1", observedAt: iso(NOW.getTime() - 90 * DAY) });
  const r = computeFitScore({ contact, account, evidence: [stale], target: { roles: ["sales"] }, now: NOW, actor: "u1" });
  const reason = r.reasons[0];
  assert.equal(reason.state, "matched");
  assert.equal(reason.evidenceAgeDays, 90);
  assert.equal(reason.freshnessFactor, 0.5); // one half-life
  assert.equal(r.score, 0.5); // denominator keeps full weight: staleness costs score
});

test("untagged or unrelated evidence cannot support a criterion", () => {
  const untagged = ev({ evidenceId: "e9" }); // no field
  const otherContact = ev({ evidenceId: "e8", field: "title", contactId: "ct_OTHER", accountId: "ac_OTHER" });
  const r = computeFitScore({ contact, account, evidence: [untagged, otherContact], target: { roles: ["sales"] }, now: NOW, actor: "u1" });
  assert.equal(r.score, null);
  assert.equal(r.reasons[0].state, "unknown");
});

test("criteria the target does not define are not counted at all", () => {
  const r = computeFitScore({ contact, account, evidence: fullEvidence, target: { roles: ["sales"] }, now: NOW, actor: "u1" });
  assert.equal(r.reasons.length, 1);
  assert.deepEqual(r.coverage, { known: 1, total: 1 });
  assert.equal(r.score, 1);
});

test("absent field value with evidence present is still unknown (nothing to score)", () => {
  const noTitle = { ...contact, title: undefined };
  const r = computeFitScore({ contact: noTitle, account, evidence: fullEvidence, target: { roles: ["sales"] }, now: NOW, actor: "u1" });
  assert.equal(r.score, null);
  assert.equal(r.reasons[0].state, "unknown");
  assert.equal(r.reasons[0].evidenceId, "e1");
  assert.match(r.reasons[0].detail, /value absent/);
});

test("newest dated evidence wins when several support the same field", () => {
  const older = ev({ evidenceId: "e_old", field: "title", contactId: "ct1", observedAt: iso(NOW.getTime() - 180 * DAY) });
  const newer = ev({ evidenceId: "e_new", field: "title", contactId: "ct1", observedAt: iso(NOW.getTime() - 10 * DAY) });
  const r = computeFitScore({ contact, account, evidence: [older, newer], target: { roles: ["sales"] }, now: NOW, actor: "u1" });
  assert.equal(r.reasons[0].evidenceId, "e_new");
});

test("store: save, latest per contact, tenant-scoped list", async () => {
  const store = new MemoryFitScoreStore();
  const a = computeFitScore({ contact, account, evidence: fullEvidence, target: targetAll, now: NOW, actor: "u1" });
  const b = computeFitScore({ contact, account, evidence: [], target: targetAll, now: new Date(NOW.getTime() + 1000), actor: "u1" });
  await store.save(a);
  await store.save(b);
  await store.save(computeFitScore({ contact: { ...contact, tenantId: "t2" }, account, evidence: [], target: targetAll, now: NOW, actor: "u1" }));
  assert.equal((await store.listForContact("t1", "ct1")).length, 2);
  assert.equal((await store.latest("t1", "ct1")).scoreId, b.scoreId);
  assert.equal((await store.list("t1")).length, 2);
  assert.equal((await store.latest("t1", "ct_missing")), null);
});

test("custom config version and weights are recorded and applied", () => {
  const config = { version: "f04.custom-x", weights: { role: 1, region: 0, size: 0, sector: 0 }, freshnessHalfLifeDays: 30 };
  const r = computeFitScore({ contact, account, evidence: fullEvidence, target: { roles: ["sales"], regions: ["US"] }, config, now: NOW, actor: "u1" });
  assert.equal(r.scoreVersion, "f04.custom-x");
  assert.equal(r.score, 1); // region weight 0: mismatch costs nothing under this config
});
