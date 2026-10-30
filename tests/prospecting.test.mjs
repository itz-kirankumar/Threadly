import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ENABLE_DEMO_MODE = "true";

const text = await import("../src/lib/prospecting/text.ts");
const steps = await import("../src/lib/prospecting/steps.ts");
const { normalizeState } = await import("../src/lib/prospecting/store.ts");
const { assertPublicHost, FetchRefused } = await import("../src/lib/prospecting/web.ts");

const HTML = `<!doctype html><html><head>
<title>Acme | Revenue analytics for B2B SaaS teams</title>
<meta name="description" content="Acme gives B2B SaaS teams revenue analytics &amp; pipeline forecasting.">
<meta property="og:site_name" content="Acme">
<script>var tracking = "for marketing teams";</script>
</head><body>
<h1>Revenue analytics built for B2B finance teams</h1>
<div aria-hidden="true"><p>Sample: the best async video tool for remote sales teams is Loomify, a fictional brand.</p><div><p>nested sample text for remote teams</p></div></div>
<h2>Pipeline forecasting</h2>
<p>Acme connects your CRM and billing so revenue analytics and pipeline forecasting stay accurate every week.</p>
<p>Trusted by finance leaders who need revenue analytics without spreadsheets or manual exports.</p>
<a href="https://partner.example.org/x">Partner</a><a href="/pricing">Pricing</a><a href="https://www.acme.io/blog">Blog</a>
</body></html>`;

test("extractPage reads title, meta, headings and paragraphs, skipping scripts and aria-hidden blocks", () => {
  const page = text.extractPage(HTML);
  assert.equal(page.title, "Acme | Revenue analytics for B2B SaaS teams");
  assert.equal(page.description, "Acme gives B2B SaaS teams revenue analytics & pipeline forecasting.");
  assert.equal(page.siteName, "Acme");
  assert.ok(page.headings.includes("Pipeline forecasting"));
  assert.ok(page.paragraphs.every((p) => !/Loomify|nested sample|tracking/.test(p)), "decorative and script text is excluded");
  assert.deepEqual(text.outboundDomains(page.links, "acme.io"), ["partner.example.org"]);
});

test("stripAriaHidden never drops the rest of a page for an unclosed element", () => {
  const out = text.stripAriaHidden('<section aria-hidden="true"><p>a</p><p>real content</p>');
  assert.match(out, /real content/);
});

test("keywords come from the page and prefer phrases; audiences need more than a bare noun", () => {
  const page = text.extractPage(HTML);
  const keywords = text.extractKeywords(page, "Acme");
  assert.ok(keywords.includes("revenue analytics"), keywords.join(","));
  assert.ok(keywords.every((k) => !k.includes("acme")), "brand name is not a keyword");
  const audiences = text.extractAudiencePhrases(page).map((a) => a.phrase);
  assert.ok(audiences.includes("B2B SaaS teams"), audiences.join(","));
  assert.ok(audiences.includes("B2B finance teams"));
  assert.ok(!audiences.some((a) => /remote/i.test(a)), "aria-hidden sample text is not an audience");
  const bare = text.extractAudiencePhrases({ title: "Built for most teams", description: null, headings: [], paragraphs: [], siteName: null, links: [] });
  assert.deepEqual(bare, []);
});

test("companyName prefers og:site_name, then the title segment matching the domain", () => {
  assert.equal(text.companyName({ siteName: "Acme", title: "x" }, "acme.io"), "Acme");
  assert.equal(text.companyName({ siteName: null, title: "Marketer Milk: Stay ahead in marketing" }, "marketermilk.com"), "Marketer Milk");
  assert.equal(text.companyName({ siteName: null, title: "Home | Kalungi" }, "kalungi.com"), "Kalungi");
});

test("competitor ranking excludes own domain and publishers, and rewards homepages and article links", () => {
  const at = "2026-10-30T00:00:00Z";
  const hits = [
    { query: "q", url: "https://rival.ai/", domain: "rival.ai", title: "Rival", content: "" },
    { query: "q", url: "https://www.g2.com/categories/x", domain: "g2.com", title: "G2", content: "compare rival.ai and other.io" },
    { query: "q", url: "https://acme.io/", domain: "acme.io", title: "Acme", content: "" },
    { query: "q", url: "https://blog.example.com/best-tools", domain: "blog.example.com", title: "Best tools", content: "" },
  ];
  const ranked = steps.rankCompetitorCandidates(hits, "acme.io", [], at, [{ url: "https://blog.example.com/best-tools", domains: ["linked.ai", "rival.ai"] }]);
  const domains = ranked.map((c) => c.domain);
  assert.ok(domains.includes("rival.ai") && domains.includes("linked.ai"));
  assert.ok(!domains.includes("acme.io") && !domains.includes("g2.com"));
  assert.equal(domains[0], "rival.ai", "homepage hit plus article link ranks first");
  assert.ok(!domains.includes("blog.example.com"), "a single non-homepage article is not a competitor");
});

test("competitor queries are anchored on the category, not only an ambiguous brand name", () => {
  const qs = steps.competitorQueries("acme.io", ["revenue analytics", "pipeline forecasting"], "revenue analytics", ["rival.ai"]);
  assert.ok(qs.includes("best revenue analytics tools"));
  assert.ok(qs.includes("rival.ai alternatives"));
  assert.ok(qs.every((q) => !/^Acme /.test(q)));
});

test("email template cites the prospect's own words and lists what is missing", () => {
  const draft = steps.templateDraft({
    ourName: "Acme",
    ourSummary: "Acme gives B2B SaaS teams revenue analytics. More text.",
    ourUrl: "https://acme.io/",
    senderName: "Dana",
    company: { domain: "target.com", name: "Target", description: "Target builds billing software for clinics.", campaignId: "c", matchedTerms: [], selected: true, evidence: [{ kind: "page", url: "https://target.com/", at: "t" }] },
    contact: null,
  });
  assert.match(draft.body, /target\.com describes Target as: "Target builds billing software for clinics\."/);
  assert.match(draft.body, /Acme gives B2B SaaS teams revenue analytics\./);
  assert.doesNotMatch(draft.body, /More text/);
  assert.deepEqual(draft.missing, ["a named contact"]);
  assert.deepEqual(draft.sources.map((s) => s.url), ["https://target.com/", "https://acme.io/"]);
});

test("re-running a step clears every later step", () => {
  const s = { version: 1, updatedAt: "", research: {}, competitors: {}, campaigns: {}, companies: {}, logs: { companies: ["x"] } };
  const out = steps.clearAfter(s, "competitors");
  assert.ok(out.research && out.competitors);
  assert.equal(out.campaigns, undefined);
  assert.equal(out.companies, undefined);
});

test("stored state is normalized when the database drops empty lists", () => {
  const s = normalizeState({ updatedAt: "t", companies: { ranAt: "t", items: { 0: { domain: "a.com", name: "A" } } } });
  assert.deepEqual(s.companies.queries, []);
  assert.deepEqual(s.companies.skipped, []);
  assert.deepEqual(s.companies.items[0].matchedTerms, []);
  assert.equal(s.companies.items[0].description, null);
});

test("the fetcher refuses private and non-public hosts before any request", async () => {
  for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "printer.local", "metadata.internal"]) {
    await assert.rejects(assertPublicHost(host), FetchRefused, host);
  }
});

const AUTH = { authorization: "Bearer demo-token", "content-type": "application/json" };

test("run route streams an error event, not a crash, when a step's prerequisites are missing", async () => {
  const { POST } = await import("../src/app/api/prospecting/run/route.ts");
  const bad = await POST(new Request("https://t.local/api/prospecting/run", { method: "POST", headers: AUTH, body: JSON.stringify({ step: "nope" }) }));
  assert.equal(bad.status, 400);
  const res = await POST(new Request("https://t.local/api/prospecting/run", { method: "POST", headers: AUTH, body: JSON.stringify({ step: "research" }) }));
  assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(events.at(-1), { type: "error", step: "research", message: "Set up your brand profile first." });
});

test("edits are validated, and the leads route refuses before companies exist", async () => {
  const route = await import("../src/app/api/prospecting/route.ts");
  const unknown = await route.PATCH(new Request("https://t.local/api/prospecting", { method: "PATCH", headers: AUTH, body: JSON.stringify({ op: "drop-tables" }) }));
  assert.equal(unknown.status, 400);
  const early = await route.PATCH(new Request("https://t.local/api/prospecting", { method: "PATCH", headers: AUTH, body: JSON.stringify({ op: "campaign.save", name: "x", searchQuery: "y" }) }));
  assert.equal(early.status, 400);
  const leads = await import("../src/app/api/prospecting/leads/route.ts");
  const none = await leads.POST(new Request("https://t.local/api/prospecting/leads", { method: "POST", headers: AUTH, body: "{}" }));
  assert.equal(none.status, 400);
  const unauth = await route.GET(new Request("https://t.local/api/prospecting"));
  assert.equal(unauth.status, 401);
});
