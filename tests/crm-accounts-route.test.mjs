import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.ENABLE_DEMO_MODE = "true";

let GET, POST, leadsPOST;
before(async () => {
  const route = await import("../src/app/api/crm/accounts/route.ts");
  GET = route.GET; POST = route.POST;
  leadsPOST = (await import("../src/app/api/crm/leads/route.ts")).POST;
});

function req(body, auth = true) {
  return new Request("https://test.local/api/crm/accounts", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: "Bearer demo-token" } : {}) },
    body: JSON.stringify(body),
  });
}
function getReq(auth = true) {
  return new Request("https://test.local/api/crm/accounts", {
    headers: auth ? { authorization: "Bearer demo-token" } : {},
  });
}

test("unauthenticated requests are rejected with 401", async () => {
  const g = await GET(getReq(false));
  assert.equal(g.status, 401);
  const p = await POST(req({ entity: "company", name: "Acme" }, false));
  assert.equal(p.status, 401);
});

test("non-JSON body is rejected with 415", async () => {
  const r = new Request("https://test.local/api/crm/accounts", {
    method: "POST",
    headers: { "content-type": "text/plain", authorization: "Bearer demo-token" },
    body: "hello",
  });
  const res = await POST(r);
  assert.equal(res.status, 415);
});

test("missing, unknown and malformed inputs map to 400; missing deal to 404", async () => {
  for (const [body, match] of [
    [{}, /entity is required/],
    [{ entity: "widget" }, /Unknown CRM entity/],
    [{ entity: "company" }, /name is required/],
    [{ entity: "company", name: 42 }, /name must be text/],
    [{ entity: "contact", name: "Ada", email: "nope" }, /valid contact email/],
    [{ entity: "deal", name: "D", stage: "bogus" }, /Unknown deal stage/],
    [{ entity: "dealStage", id: "dl-missing", stage: "won" }, /Deal not found/],
    [{ entity: "dealStage", id: "../escape", stage: "won" }, /Invalid record id/],
    [{ entity: "activity", subject: "" }, /subject is required/],
    [{ entity: "activity", subject: "Call", dueAt: "junk" }, /valid activity date/],
  ]) {
    const res = await POST(req(body));
    const payload = await res.json();
    assert.ok([400, 404].includes(res.status), `${JSON.stringify(body)} -> ${res.status}`);
    assert.match(JSON.stringify(payload), match);
  }
});

test("authorized create/update/stage/activity flow with readback", async () => {
  let res = await POST(req({ entity: "company", name: "Route Acme", domain: "route.acme" }));
  assert.equal(res.status, 200);
  const { company } = await res.json();
  assert.equal(company.status, "prospect");

  res = await POST(req({ entity: "contact", name: "Route Ada", email: "route@acme.com", companyId: company.id }));
  assert.equal(res.status, 200);
  const { contact } = await res.json();
  assert.equal(contact.companyId, company.id);

  res = await POST(req({ entity: "deal", name: "Route deal", value: 12000, currency: "usd", companyId: company.id }));
  assert.equal(res.status, 200);
  const { deal } = await res.json();
  assert.equal(deal.currency, "USD");

  res = await POST(req({ entity: "dealStage", id: deal.id, stage: "negotiation" }));
  assert.equal(res.status, 200);

  res = await POST(req({ entity: "activity", type: "task", subject: "Call Route Ada", dealId: deal.id }));
  assert.equal(res.status, 200);

  res = await GET(getReq());
  assert.equal(res.status, 200);
  const state = await res.json();
  const storedDeal = state.deals.find(d => d.id === deal.id);
  assert.equal(storedDeal.stage, "negotiation");
  assert.equal(storedDeal.probability, 75);
  assert.ok(state.companies.some(c => c.id === company.id));
  assert.ok(state.contacts.some(c => c.id === contact.id));
  assert.ok(state.activities.some(a => a.dealId === deal.id));
});

test("lead POST preserves response shape and hands off to CRM accounts", async () => {
  const res = await leadsPOST(new Request("https://test.local/api/crm/leads", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer demo-token" },
    body: JSON.stringify({ name: "Handoff Heidi", email: "heidi@handoff.io", company: "Handoff Co", domain: "handoff.io" }),
  }));
  assert.equal(res.status, 200);
  const { lead } = await res.json();
  assert.ok(lead.id.startsWith("lead-"));
  assert.equal(lead.stage, "new");

  const state = await (await GET(getReq())).json();
  const company = state.companies.find(c => c.name === "Handoff Co");
  assert.ok(company, "company created from lead");
  const contact = state.contacts.find(c => c.email === "heidi@handoff.io");
  assert.ok(contact, "contact created from lead");
  assert.equal(contact.leadId, lead.id);
  assert.equal(contact.companyId, company.id);
});
