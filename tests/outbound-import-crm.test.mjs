import { test } from "node:test";
import assert from "node:assert/strict";

const { parseCsv, mapRows, commitImport } = await import("../src/lib/outbound/csv-import.ts");
const { HubSpotAdapter, HubSpotNotConfiguredError } = await import("../src/lib/outbound/providers/hubspot.ts");

const MAPPING = { email: "Email", fullName: "Name", title: "Title", accountName: "Company", accountDomain: "Domain" };

function importStores() {
  const accounts = new Map();
  const contacts = new Map();
  const evidence = [];
  const rights = [];
  return {
    _accounts: accounts, _contacts: contacts, _evidence: evidence, _rights: rights,
    accounts: {
      async findByDomain(t, d) { return accounts.get(`${t}:${d}`) ?? null; },
      async saveAccount(a) { accounts.set(`${a.tenantId}:${a.domain}`, a); },
    },
    contacts: {
      async findByEmail(t, e) { return contacts.get(`${t}:${e}`) ?? null; },
      async saveContact(c) { contacts.set(`${c.tenantId}:${c.email}`, c); },
    },
    evidence: { async saveEvidence(e) { evidence.push(e); } },
    rights: { async saveRights(r) { rights.push(r); } },
  };
}

const CSV = `Email,Name,Title,Company,Domain
ada@acme.com,Ada Lovelace,CTO,Acme,https://www.acme.com/
bad-email,No At,Dev,Acme,acme.com
grace@hopper.io,Grace Hopper,,Hopper,hopper.io
ada@acme.com,Dup Row,CTO,Acme,acme.com
`;

test("parseCsv handles quotes, commas and CRLF", () => {
  const rows = parseCsv('a,b\r\n"x,y","say ""hi"""\r\n1,2\n');
  assert.deepEqual(rows, [["a", "b"], ["x,y", 'say "hi"'], ["1", "2"]]);
});

test("mapRows validates, normalizes and dedupes", () => {
  const { valid, invalid } = mapRows(parseCsv(CSV), MAPPING);
  assert.equal(valid.length, 2);
  assert.equal(valid[0].email, "ada@acme.com");
  assert.equal(valid[0].accountDomain, "acme.com");
  assert.equal(invalid.length, 2);
  assert.match(invalid[0].reason, /invalid email/);
  assert.match(invalid[1].reason, /duplicate/);
});

test("commitImport blocks unlicensed source", async () => {
  const { valid, invalid } = mapRows(parseCsv(CSV), MAPPING);
  await assert.rejects(
    () => commitImport(importStores(), {
      tenantId: "t1", rows: valid, invalid, sourceName: "list", acquiredAt: "2026-10-01T00:00:00Z",
      rightsConfirmed: false, subscriberClass: "corporate", country: "US", actor: "u1", now: new Date(),
    }),
    /unlicensed_source/
  );
});

test("commitImport creates evidence+rights and reconciles on re-import", async () => {
  const stores = importStores();
  const { valid, invalid } = mapRows(parseCsv(CSV), MAPPING);
  const first = await commitImport(stores, {
    tenantId: "t1", rows: valid, invalid, sourceName: "list", acquiredAt: "2026-10-01T00:00:00Z",
    rightsConfirmed: true, subscriberClass: "corporate", country: "US", actor: "u1", now: new Date("2026-10-28T00:00:00Z"),
  });
  assert.equal(first.created, 2);
  assert.equal(first.reconciled, 0);
  assert.equal(first.accountsCreated, 2);
  // One row-level evidence per contact, plus a field:"title" evidence for
  // the row that has a title (F04 dating); every record linked to contact.
  assert.equal(stores._evidence.length, 3);
  assert.equal(stores._evidence.filter((e) => e.field === "title").length, 1);
  const ada = stores._contacts.get("t1:ada@acme.com");
  for (const e of stores._evidence.filter((e) => e.sourceName === "list")) {
    assert.ok(e.contactId);
    assert.ok(e.accountId);
  }
  assert.equal(stores._evidence.find((e) => e.field === "title").contactId, ada.contactId);
  assert.equal(stores._rights.length, 2);
  assert.equal(ada.verification.state, "unknown");

  // Re-import same file: reconciles, never duplicates
  const second = await commitImport(stores, {
    tenantId: "t1", rows: valid, invalid, sourceName: "list", acquiredAt: "2026-10-15T00:00:00Z",
    rightsConfirmed: true, subscriberClass: "corporate", country: "US", actor: "u1", now: new Date("2026-10-28T01:00:00Z"),
  });
  assert.equal(second.created, 0);
  assert.equal(second.reconciled, 2);
  assert.equal(second.accountsCreated, 0);
  assert.equal(stores._contacts.size, 2);
  // The re-import's acquisitions are recorded too, linked to the same contacts.
  assert.equal(stores._evidence.length, 6);
  assert.ok(stores._evidence.slice(3).every((e) => e.acquiredAt === "2026-10-15T00:00:00Z"));
});

test("HubSpot adapter refuses without token and upserts with stub fetch", async () => {
  delete process.env.OUTBOUND_HUBSPOT_TOKEN;
  assert.throws(() => new HubSpotAdapter(), HubSpotNotConfiguredError);
  process.env.OUTBOUND_HUBSPOT_TOKEN = "test-token";

  // existing contact -> PATCH, created=false
  let adapter = new HubSpotAdapter(async (url) => {
    if (url.includes("/search")) return new Response(JSON.stringify({ results: [{ id: "hs_1" }] }), { status: 200 });
    return new Response(JSON.stringify({ id: "hs_1" }), { status: 200 });
  });
  let out = await adapter.upsertContact({ email: "ada@acme.com", fullName: "Ada Lovelace", title: "CTO", companyDomain: "acme.com" });
  assert.deepEqual(out, { externalId: "hs_1", created: false });

  // no match -> POST create
  adapter = new HubSpotAdapter(async (url) => {
    if (url.includes("/search")) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    return new Response(JSON.stringify({ id: "hs_2" }), { status: 201 });
  });
  out = await adapter.upsertContact({ email: "ada@acme.com", fullName: "Ada Lovelace", companyDomain: "acme.com" });
  assert.deepEqual(out, { externalId: "hs_2", created: true });

  // activity logging
  const note = await adapter.logActivity({ contactExternalId: "hs_2", subject: "s", body: "b", occurredAt: "2026-10-28T00:00:00Z" });
  assert.equal(note.externalId, "hs_2");

  delete process.env.OUTBOUND_HUBSPOT_TOKEN;
});
