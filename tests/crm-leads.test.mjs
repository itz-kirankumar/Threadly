import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.ENABLE_DEMO_MODE = "true";

let leads, leadById, outreach, renderTemplate, unresolvedVariables;
before(async () => {
  leads = await import("../src/app/api/crm/leads/route.ts");
  leadById = await import("../src/app/api/crm/leads/[id]/route.ts");
  outreach = await import("../src/app/api/crm/outreach/route.ts");
  ({ renderTemplate, unresolvedVariables } = await import("../src/lib/crm/outreach.ts"));
});

const AUTH = { "content-type": "application/json", authorization: "Bearer demo-token" };
const post = (url, body) => new Request(`https://test.local${url}`, { method: "POST", headers: AUTH, body: JSON.stringify(body) });
const patch = (url, body) => new Request(`https://test.local${url}`, { method: "PATCH", headers: AUTH, body: JSON.stringify(body) });
const get = (url) => new Request(`https://test.local${url}`, { headers: AUTH });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

async function createLead(overrides = {}) {
  const res = await leads.POST(post("/api/crm/leads", { name: "Dana Reyes", email: "dana@northwind.example", company: "Northwind", domain: "northwind.example", ...overrides }));
  return { res, body: await res.json() };
}

test("renderTemplate fills recorded values and leaves missing ones visible", () => {
  const out = renderTemplate("Hi {{firstName}}, about {{company}} and {{ geoScore }}", { firstName: "Dana", company: "", geoScore: undefined });
  assert.equal(out, "Hi Dana, about {{company}} and {{ geoScore }}");
  assert.deepEqual(unresolvedVariables(out).sort(), ["company", "geoScore"]);
});

test("lead creation requires real identity fields instead of inventing defaults", async () => {
  const missing = await leads.POST(post("/api/crm/leads", {}));
  assert.equal(missing.status, 400);
  const badDomain = await createLead({ domain: "not a domain" });
  assert.equal(badDomain.res.status, 400);
  const badStage = await createLead({ stage: "teleported" });
  assert.equal(badStage.res.status, 400);
  const badValue = await createLead({ dealValue: -5 });
  assert.equal(badValue.res.status, 400);
});

test("a created lead carries no invented score", async () => {
  const { res, body } = await createLead({ score: 99 });
  assert.equal(res.status, 200);
  assert.equal(body.lead.score, 0);
  assert.equal(body.lead.stage, "new");
  assert.equal(body.lead.source, "manual");
});

test("lead ids that are not the generated shape are refused before any read", async () => {
  const res = await leadById.GET(get("/api/crm/leads/x"), ctx("../templates"));
  assert.equal(res.status, 404);
  const res2 = await leadById.PATCH(patch("/api/crm/leads/x", { stage: "won" }), ctx("lead-../../x"));
  assert.equal(res2.status, 404);
});

test("PATCH validates the whole body before writing", async () => {
  const { body } = await createLead({ email: "patch@northwind.example" });
  const id = body.lead.id;
  const bad = await leadById.PATCH(patch(`/api/crm/leads/${id}`, { company: "Renamed", stage: "nope" }), ctx(id));
  assert.equal(bad.status, 400);
  const after = await (await leadById.GET(get(`/api/crm/leads/${id}`), ctx(id))).json();
  assert.equal(after.lead.company, "Northwind", "a rejected PATCH must not partially apply");
});

test("leads never send email: dispatch is refused with a pointer to Outbound", async () => {
  const { body } = await createLead({ email: "nosend@northwind.example" });
  const res = await outreach.POST(post("/api/crm/outreach", { action: "dispatch", leadId: body.lead.id }));
  assert.equal(res.status, 409);
  const payload = await res.json();
  assert.equal(payload.code, "use_outbound");
  const templates = await (await outreach.GET(get("/api/crm/outreach"))).json();
  assert.equal(templates.sendingEnabled, false);
});

test("preview reports variables that are not recorded for the lead", async () => {
  const { body } = await createLead({ email: "preview@northwind.example" });
  const res = await outreach.POST(post("/api/crm/outreach", { action: "preview", leadId: body.lead.id, step: 1 }));
  assert.equal(res.status, 200);
  const draft = await res.json();
  assert.match(draft.body, /Hi Dana,/);
  assert.ok(Array.isArray(draft.missingVariables));
  assert.doesNotMatch(`${draft.subject}\n${draft.body}`, /240%|case study/i, "starter templates contain no invented claims");
});

test("recording a reply requires the reply text and an outcome, and stops the cadence", async () => {
  const { body } = await createLead({ email: "reply@northwind.example" });
  const id = body.lead.id;
  const noText = await outreach.POST(post("/api/crm/outreach", { action: "reply", leadId: id, sentiment: "interested" }));
  assert.equal(noText.status, 400);
  const noSentiment = await outreach.POST(post("/api/crm/outreach", { action: "reply", leadId: id, replyText: "Yes, send details." }));
  assert.equal(noSentiment.status, 400);
  const ok = await outreach.POST(post("/api/crm/outreach", { action: "reply", leadId: id, replyText: "Not for us.", sentiment: "not_interested" }));
  assert.equal(ok.status, 200);
  const { lead } = await ok.json();
  assert.equal(lead.stage, "lost");
  assert.equal(lead.nextFollowUpAt, null);
});

test("template saves are validated and renumbered", async () => {
  const bad = await outreach.PUT(new Request("https://test.local/api/crm/outreach", { method: "PUT", headers: AUTH, body: JSON.stringify({ templates: [{ name: "x", subject: "", body: "b", delayDays: 1 }] }) }));
  assert.equal(bad.status, 400);
  const ok = await outreach.PUT(new Request("https://test.local/api/crm/outreach", {
    method: "PUT",
    headers: AUTH,
    body: JSON.stringify({ templates: [{ step: 7, name: "Intro", subject: "Hello {{company}}", body: "Hi {{firstName}}", delayDays: 0, extra: "dropped" }] }),
  }));
  assert.equal(ok.status, 200);
  const { templates } = await ok.json();
  assert.deepEqual(templates, [{ step: 1, name: "Intro", subject: "Hello {{company}}", body: "Hi {{firstName}}", delayDays: 0 }]);
});
