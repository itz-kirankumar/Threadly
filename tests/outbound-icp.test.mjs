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
