import assert from "node:assert/strict";
import test from "node:test";
import { recordsFrom, searchRecords } from "../src/lib/suite/search.ts";
import { BRAND_PROFILE_USES, SETTINGS_SECTIONS, SUITE_APPS, appById } from "../src/lib/suite/apps.ts";

const sources = {
  leads: [
    { id: "lead-1", name: "Marie Martin", email: "marie@tally.so", company: "Tally", domain: "tally.so", title: "Founder", stage: "follow_up_due" },
    { id: "lead-2", name: "", email: "", company: "Fillout", domain: "fillout.com", stage: "new" },
  ],
  companies: [{ id: "co-1", name: "Tally", domain: "tally.so", industry: "Forms", status: "prospect" }],
  contacts: [{ id: "ct-1", name: "Filip Minev", email: "filip@tally.so", title: "Co-founder" }],
  deals: [{ id: "d-1", name: "Tally annual", stage: "proposal", value: 4800, currency: "USD" }],
  prospects: [{ domain: "paperform.co", name: "Paperform", description: "Online forms and payments" }],
  people: [{ name: "Dino Paskvan", title: "CEO", companyDomain: "paperform.co" }],
  questions: [{ id: "q-1", text: "best form builder for startups" }],
};

test("records cover every app's data, each pointing at the app that owns it", () => {
  const records = recordsFrom(sources);
  const apps = Object.fromEntries(records.map((r) => [r.kind, r.app]));
  assert.deepEqual(apps, { Lead: "outreach", Company: "crm", Contact: "crm", Deal: "crm", Prospect: "prospect", "Decision maker": "prospect", Question: "queries" });
  // A lead with no person is shown by its company.
  assert.equal(records.find((r) => r.id === "lead-2").title, "Fillout");
  assert.match(records.find((r) => r.id === "lead-1").subtitle, /follow up due/);
});

test("search ranks a title that starts with the query first and needs every word", () => {
  const records = recordsFrom(sources);
  const hits = searchRecords("tally", records);
  assert.equal(hits[0].title, "Tally");
  assert.ok(hits.some((h) => h.kind === "Deal"));
  // Matches on hidden terms (email) too.
  assert.ok(hits.some((h) => h.kind === "Contact"));
  assert.deepEqual(searchRecords("form startups", records).map((h) => h.kind), ["Question"]);
  assert.deepEqual(searchRecords("   ", records), []);
  assert.deepEqual(searchRecords("zzz", records), []);
});

test("search ignores case and accents", () => {
  const hits = searchRecords("MARTIN", recordsFrom({ leads: [{ id: "l", name: "Marie Martín", email: "", company: "X", domain: "x.io", stage: "new" }] }));
  assert.equal(hits.length, 1);
});

test("the app registry is consistent", () => {
  const ids = SUITE_APPS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const app of SUITE_APPS) for (const to of app.feeds) assert.ok(ids.includes(to), `${app.id} feeds unknown ${to}`);
  for (const use of BRAND_PROFILE_USES) assert.ok(ids.includes(use.app));
  assert.equal(appById("crm").name, "CRM");
  assert.deepEqual(SETTINGS_SECTIONS.filter((s) => s.adminOnly).map((s) => s.id), ["brand", "keys"]);
});
