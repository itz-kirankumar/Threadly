import { test } from "node:test";
import assert from "node:assert/strict";

const { createIcpDraft, planConfirmation, currentIcp, nextVersionNumber, targetFromIcp, MemoryIcpStore } = await import("../src/lib/outbound/icp.ts");

const NOW = new Date("2026-10-28T12:00:00Z");
const base = { tenantId: "t1", actor: "u1", now: NOW, source: { kind: "manual" } };

test("a created ICP is always a draft, never auto-active (incl. url_derived)", () => {
  const manual = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  assert.equal(manual.status, "draft");
  assert.equal(manual.confirmedAt, null);
  const derived = createIcpDraft({ ...base, roles: ["sales"], source: { kind: "url_derived", url: "https://example.com/product" } }, 1);
  assert.equal(derived.status, "draft");
  assert.equal(derived.source.kind, "url_derived");
  assert.equal(derived.source.url, "https://example.com/product");
  assert.equal(currentIcp([manual, derived]), null); // nothing confirmed
});

test("confirmation activates a draft and records who and when", () => {
  const d = createIcpDraft({ ...base, roles: ["sales"], regions: ["IN"] }, 1);
  const { confirmed, superseded } = planConfirmation([d], "t1", d.icpVersionId, "admin1", new Date(NOW.getTime() + 1000));
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.confirmedBy, "admin1");
  assert.ok(confirmed.confirmedAt);
  assert.equal(superseded.length, 0);
  assert.equal(currentIcp([confirmed])?.icpVersionId, d.icpVersionId);
});

test("confirming a newer version supersedes the prior confirmed one; current follows the highest confirmed version", () => {
  const v1 = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  const c1 = planConfirmation([v1], "t1", v1.icpVersionId, "admin1", NOW).confirmed;
  const v2 = createIcpDraft({ ...base, roles: ["marketing"], now: new Date(NOW.getTime() + 2000) }, nextVersionNumber([c1]));
  assert.equal(v2.version, 2);
  const { confirmed: c2, superseded } = planConfirmation([c1, v2], "t1", v2.icpVersionId, "admin1", new Date(NOW.getTime() + 3000));
  assert.equal(superseded.length, 1);
  assert.equal(superseded[0].icpVersionId, c1.icpVersionId);
  assert.equal(superseded[0].status, "superseded");
  const cur = currentIcp([superseded[0], c2]);
  assert.equal(cur.icpVersionId, c2.icpVersionId);
  assert.deepEqual(cur.roles, ["marketing"]);
});

test("only drafts can be confirmed: re-confirm and confirming superseded are rejected", () => {
  const v1 = createIcpDraft({ ...base }, 1);
  const c1 = planConfirmation([v1], "t1", v1.icpVersionId, "a", NOW).confirmed;
  assert.throws(() => planConfirmation([c1], "t1", v1.icpVersionId, "a", NOW), /state confirmed/);
  const s = { ...c1, status: "superseded" };
  assert.throws(() => planConfirmation([s], "t1", s.icpVersionId, "a", NOW), /state superseded/);
  assert.throws(() => planConfirmation([c1], "t1", "icp_missing", "a", NOW), /not found/);
});

test("edits are new versions: the confirmed record is not mutated", () => {
  const v1 = createIcpDraft({ ...base, sectors: ["saas"], exclusions: ["competitor.example"] }, 1);
  const c1 = planConfirmation([v1], "t1", v1.icpVersionId, "a", NOW).confirmed;
  const v2 = createIcpDraft({ ...base, sectors: ["saas", "fintech"], exclusions: ["competitor.example"] }, 2);
  assert.notEqual(v2.icpVersionId, c1.icpVersionId);
  assert.deepEqual(c1.sectors, ["saas"]); // untouched
  assert.deepEqual(v2.sectors, ["saas", "fintech"]);
});

test("lists are cleaned: blanks dropped, deduped, non-strings ignored", () => {
  const d = createIcpDraft({ ...base, roles: [" sales ", "", "sales", 42, null], approvedClaims: ["claim"] }, 1);
  assert.deepEqual(d.roles, ["sales"]);
  assert.deepEqual(d.approvedClaims, ["claim"]);
});

test("targetFromIcp maps criteria; exclusions and claims are not scoring inputs", () => {
  const icp = createIcpDraft({ ...base, roles: ["sales"], regions: ["IN"], employeeBands: ["51-200"], sectors: ["saas"], exclusions: ["x.example"], approvedClaims: ["fast"] }, 1);
  const target = targetFromIcp(icp);
  assert.deepEqual(target, { roles: ["sales"], regions: ["IN"], employeeBands: ["51-200"], sectors: ["saas"] });
  assert.equal("exclusions" in target, false);
  assert.equal("approvedClaims" in target, false);
  const empty = targetFromIcp(createIcpDraft({ ...base }, 1));
  assert.deepEqual(empty, {});
});

test("store: tenant-scoped save/get/list, versions sorted desc", async () => {
  const store = new MemoryIcpStore();
  const a = createIcpDraft({ ...base }, 1);
  const b = createIcpDraft({ ...base, now: new Date(NOW.getTime() + 1000) }, 2);
  const other = createIcpDraft({ ...base, tenantId: "t2" }, 1);
  await store.save(a); await store.save(b); await store.save(other);
  assert.equal((await store.list("t1")).length, 2);
  assert.equal((await store.list("t1"))[0].version, 2);
  assert.equal((await store.get("t1", a.icpVersionId))?.version, 1);
  assert.equal(await store.get("t1", other.icpVersionId), null); // cross-tenant read blocked
  assert.equal(await store.get("t2", a.icpVersionId), null);
});

const { confirmIcp } = await import("../src/lib/outbound/icp.ts");

test("concurrent confirms of DISTINCT drafts: exactly one wins the tenant pointer; loser is superseded", async () => {
  const store = new MemoryIcpStore();
  const d1 = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  const d2 = createIcpDraft({ ...base, roles: ["marketing"], now: new Date(NOW.getTime() + 1000) }, 2);
  await store.save(d1);
  await store.save(d2);
  // Interleave: both read the empty pointer before either CAS lands.
  const first = await confirmIcp(store, "t1", d1.icpVersionId, "admin1", NOW);
  assert.equal(first.ok, true);
  // d2's confirm now runs against a pointer that moved since its read
  // (simulated by re-listing: confirmIcp re-reads the pointer each call,
  //  so the second call sees d1 current and still wins legitimately as a
  //  SEQUENTIAL confirm). The true race is exercised below.
  const second = await confirmIcp(store, "t1", d2.icpVersionId, "admin2", new Date(NOW.getTime() + 2000));
  assert.equal(second.ok, true);
  assert.equal(await store.getCurrentId("t1"), d2.icpVersionId);
  assert.equal((await store.get("t1", d1.icpVersionId)).status, "superseded");
});

test("pointer race: a confirm carrying a stale expected-pointer loses and its record is superseded", async () => {
  // Two confirms interleaved at the store level: A reads pointer=null,
  // B completes fully, then A tries to CAS null -> A loses.
  const store = new MemoryIcpStore();
  const dA = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  const dB = createIcpDraft({ ...base, roles: ["marketing"] }, 2);
  await store.save(dA);
  await store.save(dB);
  const stalePointer = await store.getCurrentId("t1"); // A's stale read: null
  const bWon = await confirmIcp(store, "t1", dB.icpVersionId, "adminB", NOW);
  assert.equal(bWon.ok, true);
  // A resumes with its stale read: pointer CAS must fail.
  const casOk = await store.casSetCurrent("t1", stalePointer, dA.icpVersionId);
  assert.equal(casOk, false);
  await store.save({ ...(await store.get("t1", dA.icpVersionId)), status: "superseded" }); // confirmIcp's cleanup shape
  assert.equal(await store.getCurrentId("t1"), dB.icpVersionId);
  assert.equal((await store.get("t1", dA.icpVersionId)).status, "superseded");
});

test("stale confirms are rejected: re-confirm, superseded, and unknown ids", async () => {
  const store = new MemoryIcpStore();
  const d = createIcpDraft({ ...base }, 1);
  await store.save(d);
  const first = await confirmIcp(store, "t1", d.icpVersionId, "a", NOW);
  assert.equal(first.ok, true);
  const again = await confirmIcp(store, "t1", d.icpVersionId, "a", new Date(NOW.getTime() + 1000));
  assert.deepEqual(again, { ok: false, reason: "not_draft" });
  assert.deepEqual(await confirmIcp(store, "t1", "icp_missing", "a", NOW), { ok: false, reason: "not_found" });
});

test("deterministic read fallback is not single activation: two force-confirmed records resolve by version, documented limit", async () => {
  // Characterization test: if two records are ever both 'confirmed' (crash
  // window before supersede hygiene), currentIcp picks deterministically -
  // but only the POINTER-backed read is proof of single activation.
  const store = new MemoryIcpStore();
  const d1 = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  const d2 = createIcpDraft({ ...base, roles: ["marketing"] }, 2);
  await store.save({ ...d1, status: "confirmed" });
  await store.save({ ...d2, status: "confirmed" });
  const fallback = currentIcp(await store.list("t1"));
  assert.equal(fallback.icpVersionId, d2.icpVersionId); // deterministic...
  assert.equal(await store.getCurrentId("t1"), null); // ...but nothing was ever singly activated
});

const { resolveCurrentIcp, icpUsableAsTarget } = await import("../src/lib/outbound/icp.ts");

test("initial-activation crash: confirmed record + no pointer resolves to NO current (fail closed)", async () => {
  // Simulates crash after the draft->confirmed record CAS but before the
  // pointer CAS on a tenant's FIRST activation.
  const store = new MemoryIcpStore();
  const d = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  await store.save({ ...d, status: "confirmed", confirmedAt: NOW.toISOString(), confirmedBy: "a" }); // crash orphan
  assert.equal(await store.getCurrentId("t1"), null);
  assert.equal(await resolveCurrentIcp(store, "t1"), null); // never exposed
});

test("pointer aimed at a record missing activatedAt resolves to NO current (post-pointer crash window)", async () => {
  const store = new MemoryIcpStore();
  const d = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  await store.save({ ...d, status: "confirmed", confirmedAt: NOW.toISOString(), confirmedBy: "a", activatedAt: null });
  await store.casSetCurrent("t1", null, d.icpVersionId);
  assert.equal(await resolveCurrentIcp(store, "t1"), null); // heals on the post-pointer record write
});

test("successful activation: pointer + activatedAt resolve current", async () => {
  const store = new MemoryIcpStore();
  const d = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  await store.save(d);
  const out = await confirmIcp(store, "t1", d.icpVersionId, "a", NOW);
  assert.equal(out.ok, true);
  assert.ok(out.confirmed.activatedAt);
  const cur = await resolveCurrentIcp(store, "t1");
  assert.equal(cur?.icpVersionId, d.icpVersionId);
  assert.ok(cur?.activatedAt);
});

test("scoring-target acceptance: activated history ok, confirmed-never-activated rejected", async () => {
  const store = new MemoryIcpStore();
  const d1 = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  const d2 = createIcpDraft({ ...base, roles: ["marketing"] }, 2);
  await store.save(d1); await store.save(d2);
  await confirmIcp(store, "t1", d1.icpVersionId, "a", NOW);
  await confirmIcp(store, "t1", d2.icpVersionId, "a", new Date(NOW.getTime() + 1000));
  const historical = await store.get("t1", d1.icpVersionId); // superseded, was activated
  assert.equal(historical.status, "superseded");
  assert.equal(icpUsableAsTarget(historical), true);
  const orphan = { ...d1, icpVersionId: "icp_orphan", status: "confirmed", activatedAt: null };
  assert.equal(icpUsableAsTarget(orphan), false);
  assert.equal(icpUsableAsTarget({ ...d1, status: "draft" }), false);
  assert.equal(icpUsableAsTarget(null), false);
});

test("pointer-race loser: never activated, not usable as a scoring target", async () => {
  const store = new MemoryIcpStore();
  const dA = createIcpDraft({ ...base, roles: ["sales"] }, 1);
  const dB = createIcpDraft({ ...base, roles: ["marketing"] }, 2);
  await store.save(dA); await store.save(dB);
  await confirmIcp(store, "t1", dB.icpVersionId, "b", NOW);
  // A resumes with its stale null pointer and loses; its record is superseded.
  assert.equal(await store.casSetCurrent("t1", null, dA.icpVersionId), false);
  const loser = { ...(await store.get("t1", dA.icpVersionId)), status: "superseded", activatedAt: null };
  await store.save(loser);
  assert.equal(icpUsableAsTarget(await store.get("t1", dA.icpVersionId)), false);
  assert.equal((await resolveCurrentIcp(store, "t1")).icpVersionId, dB.icpVersionId);
});
