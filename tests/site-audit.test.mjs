import { test } from "node:test";
import assert from "node:assert/strict";

const { auditSite } = await import("../src/lib/geo/site-audit.ts");

const good = `<!doctype html><html lang="en"><head>
<title>Acme - Revenue forecasting for B2B teams</title>
<meta name="description" content="Acme forecasts revenue for B2B sales teams from pipeline data, with integrations for Salesforce and HubSpot.">
<meta name="viewport" content="width=device-width">
<meta property="og:title" content="Acme"><meta property="og:image" content="https://acme.io/og.png">
<link rel="canonical" href="https://acme.io/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>
</head><body><h1>Forecast revenue</h1>
<a href="/pricing">Pricing</a><a href="/contact">Contact sales</a><a href="/privacy">Privacy</a><a href="https://www.linkedin.com/company/acme">LinkedIn</a>
</body></html>`;

const crawl = { hasRobotsTxt: true, hasSitemap: true, hasLlmsTxt: true, crawlersBlocked: 0, crawlersTotal: 7 };

test("a well-prepared site scores 100 and grade A, with weights totalling 100", () => {
  const a = auditSite({ ...crawl, html: good, finalUrl: "https://acme.io/", status: 200, ms: 300 });
  assert.equal(a.categories.reduce((s, c) => s + c.max, 0), 100);
  assert.equal(a.score, 100);
  assert.equal(a.grade, "A");
  assert.equal(a.passed, a.total);
});

test("blocked crawlers and an unreadable homepage pull the score down", () => {
  const a = auditSite({ ...crawl, crawlersBlocked: 2, html: "", finalUrl: "https://acme.io/", status: 0, ms: 0 });
  assert.ok(a.score < 30, `score ${a.score}`);
  assert.equal(a.grade, "D");
  const access = a.categories.find((c) => c.name === "AI crawler access");
  assert.equal(access.checks.find((c) => c.id === "ai_crawlers").passed, false);
});

test("slow responses, missing schema and two h1 tags each fail their own check", () => {
  const html = good.replace(/<script[\s\S]*?<\/script>/, "").replace("<h1>Forecast revenue</h1>", "<h1>a</h1><h1>b</h1>");
  const a = auditSite({ ...crawl, html, finalUrl: "https://acme.io/", status: 200, ms: 4000 });
  const failed = a.categories.flatMap((c) => c.checks).filter((c) => !c.passed).map((c) => c.id).sort();
  assert.deepEqual(failed, ["h1", "jsonld", "org", "speed"]);
});

test("company facts come only from the homepage's own schema.org data", async () => {
  const { organizationFacts } = await import("../src/lib/geo/site-audit.ts");
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","foundingDate":"2013-05-01","address":{"addressLocality":"Ann Arbor","addressCountry":"US"},"numberOfEmployees":{"value":120}}]}</script>`;
  assert.deepEqual(organizationFacts(html), { founded: "2013", location: "Ann Arbor, US", employees: "120" });
  assert.deepEqual(organizationFacts("<html></html>"), { founded: null, location: null, employees: null });
  assert.deepEqual(organizationFacts('<script type="application/ld+json">{bad</script>'), { founded: null, location: null, employees: null });
});
