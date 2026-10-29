import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.ENABLE_DEMO_MODE = "true";

let POST, withWorkspace, writeData;
before(async () => {
  ({ POST } = await import("../src/app/api/crm/discover/route.ts"));
  ({ withWorkspace, writeData } = await import("../src/lib/portal-db.ts"));
  const at = "2026-10-20T10:00:00.000Z";
  const answer = (provider, extra) => ({
    provider, status: "scanned", answer: "...", citations: [], brandMentioned: false, brandCited: false,
    brandCitationCount: 0, brandPosition: null, competitorsMentioned: [], competitorsCited: [], scannedAt: at, ...extra,
  });
  await withWorkspace("demo-founder-uid", "demo-token", async () => {
    await writeData("geo/brand", {
      name: "Acme", domain: "acme.example", aliases: [], category: "billing software", createdAt: at, updatedAt: at,
      competitors: [
        { name: "Observed Co", domain: "observed.example" },
        { name: "Never Seen Co", domain: "neverseen.example" },
      ],
    });
    await writeData("geo/queries", { q1: { id: "q1", text: "best billing software", createdAt: at } });
    await writeData("geo/runs", { r1: { id: "r1", startedAt: at, finishedAt: at, queryCount: 1, providerStatus: {} } });
    await writeData("geo/latestRun", "r1");
    await writeData("geo/results/r1", [{
      queryId: "q1",
      results: [
        answer("openai", { competitorsMentioned: ["Observed Co"], citations: [{ url: "https://observed.example/x", domain: "observed.example", title: "x" }] }),
        answer("anthropic", {}),
        { ...answer("gemini", { competitorsMentioned: ["Never Seen Co"] }), status: "failed" },
      ],
      webResults: [
        { url: "https://www.webonly.example/a", domain: "www.webonly.example", title: "Web only" },
        { url: "https://reddit.com/r/x", domain: "reddit.com", title: "Thread" },
        { url: "https://acme.example/", domain: "acme.example", title: "Own site" },
      ],
    }]);
  });
});

test("discovery adds only observed domains and states the observation with its denominator", async () => {
  const res = await POST(new Request("https://test.local/api/crm/discover", { method: "POST", headers: { authorization: "Bearer demo-token" } }));
  assert.equal(res.status, 200);
  const { discovered, newLeads } = await res.json();
  const domains = newLeads.map((l) => l.domain).sort();
  assert.deepEqual(domains, ["observed.example", "webonly.example"], "unobserved competitor, community site and own domain are skipped");
  assert.equal(discovered, 2);

  const observed = newLeads.find((l) => l.domain === "observed.example");
  // The failed provider is not part of the denominator.
  assert.match(observed.notes, /Mentioned in 1 of 2 scanned AI answers across 1 tracked question; cited in 1\./);
  assert.equal(observed.geoGap.citationShare, 50);
  assert.deepEqual(observed.geoGap.competitorsCited, []);
  assert.equal(observed.score, 0);
  assert.equal(observed.email, "");

  const web = newLeads.find((l) => l.domain === "webonly.example");
  assert.equal(web.geoGap.missingFromAi, true);
  assert.match(web.notes, /not cited in the 2 scanned AI answers/);
  for (const lead of newLeads) assert.doesNotMatch(lead.notes, /high[- ]intent|100%|dominate/i);
});

test("a repeat run adds nothing new", async () => {
  const res = await POST(new Request("https://test.local/api/crm/discover", { method: "POST", headers: { authorization: "Bearer demo-token" } }));
  const { discovered } = await res.json();
  assert.equal(discovered, 0);
});
