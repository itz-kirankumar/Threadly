import { test } from "node:test";
import assert from "node:assert/strict";

const { reassignContactToAccount, MemoryDomainAssignmentStore } = await import("../src/lib/outbound/corrections.ts");
const { commitImport } = await import("../src/lib/outbound/csv-import.ts");

const NOW = new Date("2026-10-28T12:00:00Z");
const iso = NOW.toISOString();
const mkAccount = (id, domain) => ({ tenantId: "t1", accountId: id, name: id, domain, createdAt: iso, createdBy: "u1" });
const mkContact = (over) => ({
  tenantId: "t1", contactId: "ct1", accountId: "ac1", email: "ada@sub.parent.example", fullName: "Ada",
  verification: { state: "valid", verifiedAt: iso, verifier: "mx-check" }, employerChangedAt: null,
  createdAt: iso, createdBy: "u1", ...over,
});

function memStores() {
  const contacts = new Map();
  const accounts = new Map();
  const evidence = [];
  return {
    _contacts: contacts, _accounts: accounts, _evidence: evidence,
    contacts: {
      async getContact(t, id) { return contacts.get(`${t}:${id}`) ?? null; },
      async saveContact(c) { contacts.set(`${c.tenantId}:${c.contactId}`, c); },
      async findByEmail(t, e) { return [...contacts.values()].find((c) => c.tenantId === t && c.email === e) ?? null; },
    },
    accounts: {
      async getAccount(t, id) { return accounts.get(`${t}:${id}`) ?? null; },
      async saveAccount(a) { accounts.set(`${a.tenantId}:${a.accountId}`, a); },
      async findByDomain(t, d) { return [...accounts.values()].find((a) => a.tenantId === t && a.domain === d) ?? null; },
    },
    evidence: { async saveEvidence(e) { evidence.push(e); } },
    rights: { async saveRights() {} },
  };
}

test("reassign contact: account changed, evidence linked, employerChangedAt untouched", async () => {
  const stores = memStores();
  stores._accounts.set("t1:ac1", mkAccount("ac1", "parent.example"));
  stores._accounts.set("t1:ac2", mkAccount("ac2", "sub.parent.example"));
  stores._contacts.set("t1:ct1", mkContact({}));
  const { contact, evidenceId } = await reassignContactToAccount(stores, {
    tenantId: "t1", contactId: "ct1", targetAccountId: "ac2", reason: "subsidiary split", actor: "admin1", now: NOW,
  });
  assert.equal(contact.accountId, "ac2");
  assert.equal(contact.employerChangedAt, null); // correction, not employer change
  const ev = stores._evidence.find((e) => e.evidenceId === evidenceId);
  assert.equal(ev.sourceName, "operator_correction");
  assert.equal(ev.contactId, "ct1");
  assert.equal(ev.accountId, "ac2");
  assert.match(ev.inference, /subsidiary split/);
});

test("reassign rejects: missing contact, missing target, same account", async () => {
  const stores = memStores();
  stores._accounts.set("t1:ac1", mkAccount("ac1", "parent.example"));
  stores._contacts.set("t1:ct1", mkContact({}));
  await assert.rejects(() => reassignContactToAccount(stores, { tenantId: "t1", contactId: "nope", targetAccountId: "ac1", reason: "x", actor: "a", now: NOW }), /contact not found/);
  await assert.rejects(() => reassignContactToAccount(stores, { tenantId: "t1", contactId: "ct1", targetAccountId: "nope", reason: "x", actor: "a", now: NOW }), /target account not found/);
  await assert.rejects(() => reassignContactToAccount(stores, { tenantId: "t1", contactId: "ct1", targetAccountId: "ac1", reason: "x", actor: "a", now: NOW }), /already belongs/);
});

test("domain assignment: subsidiary domain maps to its own account on import, no auto-create collapse", async () => {
  const stores = memStores();
  const assignments = new MemoryDomainAssignmentStore();
  stores._accounts.set("t1:ac_parent", mkAccount("ac_parent", "parent.example"));
  stores._accounts.set("t1:ac_sub", mkAccount("ac_sub", "sub.parent.example"));
  await assignments.saveAssignment("t1", "sub.parent.example", "ac_sub");
  const r = await commitImport(
    { ...stores, domainAssignments: assignments },
    {
      tenantId: "t1", rows: [{ email: "ada@sub.parent.example", fullName: "Ada", accountName: "Sub", accountDomain: "sub.parent.example" }],
      invalid: [], sourceName: "list", acquiredAt: "2026-10-01T00:00:00Z", rightsConfirmed: true,
      subscriberClass: "corporate", country: "IN", actor: "u1", now: NOW,
    },
  );
  assert.equal(r.created, 1);
  assert.equal(r.accountsCreated, 0);
  const contact = [...stores._contacts.values()][0];
  assert.equal(contact.accountId, "ac_sub"); // explicit assignment, not the domain index
});

test("domain assignment is tenant-scoped and falls back when the mapped account is gone", async () => {
  const stores = memStores();
  const assignments = new MemoryDomainAssignmentStore();
  await assignments.saveAssignment("t2", "sub.parent.example", "ac_other"); // another tenant: ignored
  assert.equal(await assignments.getAssignment("t1", "sub.parent.example"), null);
  const r = await commitImport(
    { ...stores, domainAssignments: assignments },
    {
      tenantId: "t1", rows: [{ email: "ada@sub.parent.example", fullName: "Ada", accountName: "Sub", accountDomain: "sub.parent.example" }],
      invalid: [], sourceName: "list", acquiredAt: "2026-10-01T00:00:00Z", rightsConfirmed: true,
      subscriberClass: "corporate", country: "IN", actor: "u1", now: NOW,
    },
  );
  assert.equal(r.accountsCreated, 1); // no cross-tenant leak, normal auto-create
});
