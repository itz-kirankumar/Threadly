import { test } from "node:test";
import assert from "node:assert/strict";

const { registerLicensedSource, requireLicensedSource, MemoryLicensedSourceStore } = await import("../src/lib/outbound/discovery.ts");
const { commitImport, mapRows, parseCsv } = await import("../src/lib/outbound/csv-import.ts");

const NOW = new Date("2026-10-28T12:00:00Z");

function memStores(evidenceSink) {
  const accounts = new Map();
  const contacts = new Map();
  return {
    accounts: {
      async findByDomain(t, d) { return accounts.get(`${t}:${d}`) ?? null; },
      async saveAccount(a) { accounts.set(`${a.tenantId}:${a.domain}`, a); },
    },
    contacts: {
      async findByEmail(t, e) { return contacts.get(`${t}:${e}`) ?? null; },
      async saveContact(c) { contacts.set(`${c.tenantId}:${c.email}`, c); },
    },
    evidence: { async saveEvidence(e) { evidenceSink.push(e); } },
    rights: { async saveRights() {} },
    _contacts: contacts,
  };
}
const baseInput = {
  tenantId: "t1", rows: [], invalid: [], sourceName: "file.csv",
  acquiredAt: "2026-10-01T00:00:00Z", rightsConfirmed: true,
  subscriberClass: "corporate", country: "IN", actor: "u1", now: NOW,
};
const ROW = { email: "ada@corp.example", fullName: "Ada", title: "Head of Sales", accountName: "Corp", accountDomain: "corp.example" };

test("registry: register, require passes for permitting unrevoked source", () => {
  const src = registerLicensedSource({ tenantId: "t1", sourceName: "AcmeData", licensePermitsUse: true, termsUrl: "https://acme.example/terms", actor: "u1", now: NOW });
  assert.equal(src.sourceName, "acmedata");
  const got = requireLicensedSource([src], "t1", "ACMEDATA");
  assert.equal(got.sourceId, src.sourceId);
});

test("unlicensed source blocked: unknown, non-permitting, revoked, cross-tenant", () => {
  const good = registerLicensedSource({ tenantId: "t1", sourceName: "acmedata", licensePermitsUse: true, actor: "u1", now: NOW });
  assert.throws(() => requireLicensedSource([good], "t1", "other"), /not a registered licensed source/);
  const noPermit = registerLicensedSource({ tenantId: "t1", sourceName: "nopermit", licensePermitsUse: false, actor: "u1", now: NOW });
  assert.throws(() => requireLicensedSource([noPermit], "t1", "nopermit"), /does not permit/);
  const revoked = { ...good, revokedAt: NOW.toISOString() };
  assert.throws(() => requireLicensedSource([revoked], "t1", "acmedata"), /revoked/);
  assert.throws(() => requireLicensedSource([good], "t2", "acmedata"), /not a registered/);
});

test("licensed_api import: evidence kind + source recorded, linked to contact and account", async () => {
  const sink = [];
  const stores = memStores(sink);
  const src = registerLicensedSource({ tenantId: "t1", sourceName: "acmedata", licensePermitsUse: true, actor: "u1", now: NOW });
  requireLicensedSource([src], "t1", "acmedata"); // gate before commit
  const r = await commitImport(stores, { ...baseInput, rows: [ROW], licensedSource: { sourceName: src.sourceName, sourceId: src.sourceId } });
  assert.equal(r.created, 1);
  const row = sink.find((e) => e.field === undefined);
  assert.equal(row.kind, "licensed_api");
  assert.equal(row.sourceName, "acmedata");
  const contact = stores._contacts.get("t1:ada@corp.example");
  assert.equal(row.contactId, contact.contactId);
  assert.equal(row.accountId, contact.accountId);
  const titleEv = sink.find((e) => e.field === "title");
  assert.ok(titleEv);
  assert.equal(titleEv.contactId, contact.contactId);
  assert.equal(titleEv.kind, "licensed_api");
});

test("csv import: evidence linked to contact+account; re-import records a fresh linked acquisition", async () => {
  const sink = [];
  const stores = memStores(sink);
  await commitImport(stores, { ...baseInput, rows: [ROW] });
  assert.equal(sink.length, 2); // row evidence + title field evidence
  const contact = stores._contacts.get("t1:ada@corp.example");
  for (const e of sink) {
    assert.equal(e.contactId, contact.contactId);
    assert.equal(e.accountId, contact.accountId);
  }
  sink.length = 0;
  const r2 = await commitImport(stores, { ...baseInput, rows: [ROW], acquiredAt: "2026-10-15T00:00:00Z" });
  assert.equal(r2.reconciled, 1);
  assert.equal(r2.created, 0);
  assert.equal(sink.length, 2); // the new acquisition is recorded too, linked to the SAME contact
  for (const e of sink) {
    assert.equal(e.contactId, contact.contactId);
    assert.equal(e.acquiredAt, "2026-10-15T00:00:00Z");
  }
});

test("rights confirmation still required for licensed_api rows", async () => {
  const sink = [];
  await assert.rejects(
    () => commitImport(memStores(sink), { ...baseInput, rows: [ROW], rightsConfirmed: false, licensedSource: { sourceName: "acmedata", sourceId: "ls_x" } }),
    /unlicensed_source/,
  );
});

test("preview path unchanged: parse + validate writes nothing", () => {
  const { valid, invalid } = mapRows(parseCsv("email,name,company,domain\nada@corp.example,Ada,Corp,corp.example\nbad,,Corp,"), { email: "email", fullName: "name", accountName: "company", accountDomain: "domain" });
  assert.equal(valid.length, 1);
  assert.equal(invalid.length, 1);
});
