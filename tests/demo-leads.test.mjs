import { test } from "node:test";
import assert from "node:assert/strict";

const leads = await import("../src/lib/live-demo/leads.ts");
const NOW = Date.parse("2026-11-03T00:00:00Z");

const results = {
  competitors: [{ name: "HubSpot", domain: "hubspot.com", description: null }, { name: "Pipedrive", domain: "pipedrive.com", description: null }],
  companies: [
    { name: "Redgate", domain: "red-gate.com", description: "Database DevOps tools.", signal: "Customer of Cognism", matchedTerms: [] },
    { name: "Stein", domain: "steinb2b.com", description: "B2B agency.", signal: "Matches B2B Teams", matchedTerms: ["b2b"] },
  ],
  contacts: { roles: ["Head of Sales", "VP Sales"], companies: [], people: [{ company: "Redgate", domain: "red-gate.com", name: "Jake Sigrist", title: "Regional Sales Director", source: null, profileUrl: "https://www.linkedin.com/in/jake", via: "public search", sequence: { dm: "Hi Jake", followUps: [] } }] },
  social: {
    topic: "CRM",
    leads: [
      { platform: "Reddit", url: "https://reddit.com/r/CRM/comments/1/a", title: "Moving off HubSpot, what next?", snippet: "", author: null, community: "r/CRM", intent: "looking for an alternative", matched: ["HubSpot", "crm"], reply: "r", postedAt: null, window: "month", authorName: null, profileUrl: null },
      { platform: "X", url: "https://x.com/jane/status/1", title: "Which CRM for a 5 person team?", snippet: "", author: "@jane", community: null, intent: "asking for a recommendation", matched: ["crm"], reply: null, postedAt: "2026-10-30T00:00:00Z", window: null, authorName: "Jane Doe", profileUrl: "https://x.com/jane" },
      { platform: "LinkedIn", url: "https://linkedin.com/posts/x", title: "CRM trends", snippet: "", author: null, community: null, intent: "discussing the topic", matched: ["crm"], reply: null, postedAt: null, window: null, authorName: null, profileUrl: null },
    ],
  },
};

test("every lead is scored from the run's facts, best first", () => {
  const list = leads.buildLeads(results, NOW);
  assert.deepEqual(list.map((l) => l.kind), ["Person asking", "Person asking", "Decision maker", "Company"]);
  const [switcher, asker, person, company] = list;
  assert.equal(switcher.priority, "Hot");
  assert.ok(switcher.why.includes("names HubSpot") && switcher.why.includes("posted this month"));
  assert.equal(asker.name, "Jane Doe");
  assert.ok(person.why.some((w) => /uses Cognism/.test(w)) && person.why.includes("direct profile link"));
  assert.equal(company.name, "Stein", "a company with a decision maker appears once, as the person");
  assert.ok(list.every((l, i) => i === 0 || list[i - 1].score >= l.score));
});

test("conversation that is not an ask is not a lead", () => {
  assert.ok(!leads.buildLeads(results, NOW).some((l) => l.detail === "CRM trends"));
});

test("priorities follow the score bands", () => {
  assert.equal(leads.priorityOf(75), "Hot");
  assert.equal(leads.priorityOf(74), "Warm");
  assert.equal(leads.priorityOf(55), "Warm");
  assert.equal(leads.priorityOf(54), "Cold");
});

test("the CSV escapes commas and quotes", () => {
  const csv = leads.leadsCsv(leads.buildLeads(results, NOW));
  const lines = csv.split("\n");
  assert.equal(lines[0], "priority,score,fit,intent,reach,type,name,company,title_or_post,source,profile_url,source_url,bant,why");
  assert.equal(lines.length, 5);
  assert.ok(lines.some((l) => l.includes('"Moving off HubSpot, what next?"')));
});
