import assert from "node:assert/strict";
import test from "node:test";
import { recordsFrom, searchRecords } from "../src/lib/suite/search.ts";
import { buildSummary } from "../src/lib/suite/summary.ts";
import { countryFromLanguages, countryFromZone, detectCountry } from "../src/lib/billing/country.ts";
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

test("rail badges flag what is waiting in each app", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const s = buildSummary({
    leads: [
      { domain: "a.io", stage: "follow_up_due", score: 40 },
      { domain: "b.io", stage: "new", score: 82 },
      { domain: "c.io", stage: "contacted", score: 50, nextFollowUpAt: "2026-11-08T00:00:00Z" },
      { domain: "d.io", stage: "won", score: 90 },
    ],
    deals: [{ stage: "proposal" }, { stage: "won" }, { stage: "discovery" }],
    prospecting: { selected: ["a.io", "E.io", "f.io"] },
    questions: 4,
    runs: 21,
    now,
  });
  assert.deepEqual(s.badges.outreach, { count: 3, alert: true, hint: "2 follow-ups due, 1 hot lead not contacted" });
  assert.equal(s.badges.crm.count, 2);
  assert.deepEqual(s.badges.prospect, { count: 2, alert: true, hint: "2 selected companies not saved to Leads" });
  assert.equal(s.badges.queries.count, 4);
  assert.equal(s.badges.runs.count, 21);
  const calm = buildSummary({ leads: [{ domain: "x.io", stage: "contacted", score: 30 }], deals: null, prospecting: { selected: ["x.io"] }, questions: null, runs: null, now });
  assert.deepEqual(calm.badges.outreach, { count: 1, alert: false, hint: "1 open lead" });
  assert.equal(calm.badges.prospect, undefined);
  assert.equal(calm.badges.crm, undefined);
});

test("billing country is recognised from the best signal available", () => {
  assert.deepEqual(detectCountry({ saved: "us", hint: "IN" }), { code: "US", source: "saved" });
  assert.deepEqual(detectCountry({ hint: "IN", zone: "Europe/London" }), { code: "IN", source: "location" });
  // Unknown edge country falls through to the time zone, which beats an en-US browser in India.
  assert.deepEqual(detectCountry({ hint: "XX", zone: "Asia/Kolkata", languages: ["en-US"] }), { code: "IN", source: "time zone" });
  assert.deepEqual(detectCountry({ zone: "Mars/Base", languages: ["en", "de-DE"] }), { code: "DE", source: "browser language" });
  assert.equal(detectCountry({}), null);
  assert.equal(countryFromZone("Asia/Calcutta"), "IN");
  assert.equal(countryFromLanguages(["fr"]), null);
});
