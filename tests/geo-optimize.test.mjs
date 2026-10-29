import { test } from "node:test";
import assert from "node:assert/strict";

const { parseAuditDomain } = await import("../src/lib/geo/openseo-engine.ts");
const { generateBrandKnowledgeFacts, diagnosePrompt, summarizeCitationSources } = await import("../src/lib/geo/geoflow-engine.ts");

test("audit domains must be public hostnames", () => {
  assert.equal(parseAuditDomain("https://www.Example.org/pricing?x=1"), "www.example.org");
  assert.equal(parseAuditDomain("acme.io"), "acme.io");
  for (const bad of ["", "localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "[::1]", "acme.io:8443", "user@acme.io", "db.internal", "printer.local", "acme", "a..b.com", "-bad.com", "x".repeat(250) + ".com"]) {
    assert.equal(parseAuditDomain(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

const at = "2026-10-20T10:00:00.000Z";
const brand = {
  name: "Acme", domain: "acme.io", aliases: ["Acme Billing"], category: "billing software", createdAt: at, updatedAt: at,
  competitors: [{ name: "Rival", domain: "rival.com", aliases: [] }],
};

test("brand facts come only from the profile; the rest are marked as needing input", () => {
  const facts = generateBrandKnowledgeFacts(brand);
  const fromProfile = facts.filter((f) => f.source === "brand_profile");
  assert.deepEqual(fromProfile.map((f) => f.assertion), [
    "Acme (acme.io) operates in billing software.",
    "Acme is also known as Acme Billing.",
  ]);
  for (const f of facts.filter((f) => f.source === "needs_input")) assert.equal(f.assertion, null);
  for (const f of facts) assert.equal("modelConfidence" in f, false);
});

const answer = (extra) => ({
  provider: "chatgpt", status: "scanned", answer: "", citations: [], brandMentioned: false, brandCited: false,
  brandCitationCount: 0, brandPosition: null, competitorsMentioned: [], competitorsCited: [], scannedAt: at, ...extra,
});
const queries = [
  { id: "q1", text: "best billing software", intent: "commercial", createdAt: at },
  { id: "q2", text: "Acme vs Rival", intent: "comparative", createdAt: at },
];
const results = [
  { queryId: "q1", results: [
    answer({ brandMentioned: true, brandCited: true, citations: [{ url: "https://acme.io/a", domain: "acme.io", title: "" }, { url: "https://g2.com/x", domain: "www.g2.com", title: "" }, { url: "https://g2.com/y", domain: "g2.com", title: "" }] }),
    answer({ citations: [{ url: "https://rival.com/", domain: "rival.com", title: "" }, { url: "https://g2.com/z", domain: "g2.com", title: "" }] }),
    { ...answer({ brandMentioned: true }), status: "failed" },
  ] },
  { queryId: "q2", results: [answer({ brandMentioned: true })] },
];

test("question check reports observed counts for the same intent, with the scanned answers as denominator", () => {
  const d = diagnosePrompt("Best billing software?", brand, queries, results);
  assert.equal(d.intent, "commercial");
  assert.deepEqual(d.trackedMatch, { id: "q1", text: "best billing software" });
  assert.deepEqual(d.evidence, { intent: "commercial", trackedQuestions: 1, scannedAnswers: 2, answersMentioningBrand: 1, answersCitingBrand: 1 });
  assert.equal("citationProbability" in d, false);
  assert.ok(d.suggestedQuestions.every((s) => s.toLowerCase() !== "best billing software"));
});

test("cited sources are counted per answer and labelled by relation", () => {
  const summary = summarizeCitationSources(brand, results);
  assert.equal(summary.scannedAnswers, 3);
  const byDomain = Object.fromEntries(summary.sources.map((s) => [s.domain, s]));
  assert.equal(byDomain["g2.com"].answersCiting, 2);
  assert.equal(byDomain["g2.com"].citations, 3);
  assert.equal(byDomain["g2.com"].relation, "third_party");
  assert.equal(byDomain["acme.io"].relation, "yours");
  assert.equal(byDomain["rival.com"].relation, "competitor");
  assert.equal(summary.sources[0].domain, "g2.com");
});

test("with no scans the summary is empty rather than invented", () => {
  assert.deepEqual(summarizeCitationSources(brand, []), { scannedAnswers: 0, sources: [] });
  const d = diagnosePrompt("what is billing software", brand, [], []);
  assert.equal(d.evidence.scannedAnswers, 0);
});
