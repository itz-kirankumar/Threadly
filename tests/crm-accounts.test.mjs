import { test } from "node:test";
import assert from "node:assert/strict";

const { withWorkspace } = await import("../src/lib/portal-db.ts");
const store = await import("../src/lib/crm/accounts-store.ts");

let seq = 0;
function ws(fn) {
  seq += 1;
  return withWorkspace(`crm-test-${Date.now()}-${seq}`, "demo-token", fn);
}

const LEAD = {
  id: "lead-t1", name: "Ada Lovelace", email: "ada@acme.com", company: "Acme",
  domain: "acme.com", title: "CTO", stage: "new", source: "manual", score: 60,
  sequenceStep: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

test("company requires a name", async () => {
  await ws(async () => {
    await assert.rejects(() => store.saveCompany({ name: "  ", owner: "o" }), /Company name is required/);
  });
});

test("company create then update preserves createdAt and bumps updatedAt", async () => {
  await ws(async () => {
    const created = await store.saveCompany({ name: "Acme", domain: "acme.com", owner: "o@x.com" });
    assert.equal(created.status, "prospect");
    assert.equal(created.source, "manual");
    const updated = await store.saveCompany({ id: created.id, name: "Acme", industry: "SaaS", status: "customer", owner: "o@x.com" });
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.status, "customer");
    assert.equal(updated.industry, "SaaS");
    assert.ok(updated.updatedAt >= created.updatedAt);
  });
});

test("contact validates email format", async () => {
  await ws(async () => {
    await assert.rejects(() => store.saveContact({ name: "Bad", email: "not-an-email", owner: "o" }), /valid contact email/);
    const ok = await store.saveContact({ name: "Good", email: "GOOD@X.COM ", owner: "o" });
    assert.equal(ok.email, "good@x.com");
  });
});

test("deal sanitizes value and clamps probability; currency uppercased", async () => {
  await ws(async () => {
    const deal = await store.saveDeal({ name: "Acme expansion", value: -50, probability: 250, currency: "usd", owner: "o" });
    assert.equal(deal.value, 0);
    assert.equal(deal.probability, 100);
    assert.equal(deal.currency, "USD");
    assert.equal(deal.stage, "qualification");
  });
});

test("updateDealStage sets stage probability and rejects unknown deals and stages", async () => {
  await ws(async () => {
    const deal = await store.saveDeal({ name: "Pipeline", owner: "o" });
    await store.updateDealStage(deal.id, "won");
    const deals = await store.loadDeals();
    assert.equal(deals[0].stage, "won");
    assert.equal(deals[0].probability, 100);
    await assert.rejects(() => store.updateDealStage("dl-missing", "won"), /Deal not found/);
    await assert.rejects(() => store.updateDealStage(deal.id, "bogus"), /Unknown deal stage/);
  });
});

test("activity requires subject and a parseable due date", async () => {
  await ws(async () => {
    await assert.rejects(() => store.saveWorkspaceActivity({ type: "note", subject: "", owner: "o" }), /subject is required/);
    await assert.rejects(() => store.saveWorkspaceActivity({ type: "task", subject: "Call", dueAt: "not-a-date", owner: "o" }), /valid activity date/);
    const ok = await store.saveWorkspaceActivity({ type: "task", subject: "Call Ada", dueAt: "2026-11-01T10:00", owner: "o" });
    assert.equal(ok.completedAt, null);
  });
});

test("syncLeadToAccounts creates company and contact once, then dedupes", async () => {
  await ws(async () => {
    await store.syncLeadToAccounts(LEAD, "o@x.com");
    let state = await store.loadCrmAccountsState();
    assert.equal(state.companies.length, 1);
    assert.equal(state.companies[0].name, "Acme");
    assert.equal(state.companies[0].domain, "acme.com");
    assert.equal(state.contacts.length, 1);
    assert.equal(state.contacts[0].leadId, "lead-t1");
    assert.equal(state.contacts[0].companyId, state.companies[0].id);

    // A second lead at the same company (different case) reuses the company;
    // the same email reuses the contact and re-links to the newer lead.
    await store.syncLeadToAccounts({ ...LEAD, id: "lead-t2", name: "A. Lovelace", company: "ACME" }, "o@x.com");
    state = await store.loadCrmAccountsState();
    assert.equal(state.companies.length, 1);
    assert.equal(state.contacts.length, 1);
    assert.equal(state.contacts[0].leadId, "lead-t2");

    // A different person at the same company adds a contact, not a company.
    await store.syncLeadToAccounts({ ...LEAD, id: "lead-t3", name: "Grace", email: "grace@acme.com", company: "acme" }, "o@x.com");
    state = await store.loadCrmAccountsState();
    assert.equal(state.companies.length, 1);
    assert.equal(state.contacts.length, 2);
  });
});
