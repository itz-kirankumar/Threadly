import { test } from "node:test";
import assert from "node:assert/strict";

const steps = await import("../src/lib/prospecting/steps.ts");
const text = await import("../src/lib/prospecting/text.ts");
const quota = await import("../src/lib/live-demo/quota.ts");

test("companies are known by their registrable domain", () => {
  assert.equal(steps.rootDomain("academy.intercom.com"), "intercom.com");
  assert.equal(steps.rootDomain("https://www.example.co.uk/pricing"), "example.co.uk");
  assert.equal(steps.rootDomain("shop.brand.com.au"), "brand.com.au");
  assert.equal(steps.rootDomain("attio.com"), "attio.com");
});

test("publishers, free hosting, CDNs and duplicate TLDs do not become competitors", () => {
  const at = "t";
  const hit = (domain) => ({ query: "q", url: `https://${domain}/`, domain, title: domain, content: "" });
  const ranked = steps.rankCompetitorCandidates(
    ["streamingmedia.com", "enterpriseaiworld.com", "someone.github.io", "s.yimg.com", "creatio.ai", "creatio.com", "creatio.com", "rival.io"].map(hit),
    "acme.io",
    [],
    at,
  );
  const domains = ranked.map((c) => c.domain);
  assert.ok(domains.includes("rival.io"));
  assert.equal(domains.filter((d) => d.startsWith("creatio.")).length, 1, "one brand on two TLDs is one competitor");
  for (const bad of ["streamingmedia.com", "enterpriseaiworld.com", "github.io", "yimg.com"]) {
    assert.ok(!domains.some((d) => d.endsWith(bad)), bad);
  }
});

test("topic relevance needs a phrase or two distinct words", () => {
  const terms = steps.topicTerms(["revenue teams"], "CRM for agentic revenue");
  assert.ok(terms.includes("crm"), "short acronyms count");
  assert.deepEqual(steps.onTopic("We grow revenue", terms), []);
  assert.ok(steps.onTopic("The CRM built for revenue", terms).length >= 2);
  assert.ok(steps.onTopic("Tools for revenue teams", terms).includes("revenue teams"));
});

test("the category comes from the title segment that is not the brand", () => {
  assert.equal(text.categoryFromPage({ title: "Threadly — Enterprise GEO Intelligence", headings: [] }, "Threadly"), "Enterprise GEO Intelligence");
  assert.equal(text.categoryFromPage({ title: "Attio: CRM for agentic revenue", headings: [] }, "Attio"), "CRM for agentic revenue");
  assert.equal(text.categoryFromPage({ title: "Home", headings: ["Payments infrastructure for the internet"] }, "Stripe"), "Payments infrastructure for the internet");
  assert.equal(text.categoryFromPage({ title: "Acme", headings: ["Hi!"] }, "Acme"), null);
});

test("company names drop taglines and trademark marks", () => {
  assert.equal(text.companyName({ siteName: "Wayfront® – Agency Client Portal Software", title: "x" }, "spp.io"), "Wayfront");
  assert.equal(text.companyName({ siteName: null, title: "ClickUp™ | The everything app" }, "clickup.com"), "ClickUp");
});

test("the first email introduces the sender's company", () => {
  const company = { domain: "t.com", name: "T", description: "T builds billing software.", campaignId: "c", matchedTerms: [], selected: true, evidence: [] };
  const a = steps.templateDraft({ ourName: "Attio", ourSummary: "The system for revenue teams to build pipeline.", ourUrl: null, senderName: "", company, contact: null });
  assert.match(a.body, /Attio is the system for revenue teams to build pipeline\./);
  const b = steps.templateDraft({ ourName: "Acme", ourSummary: "Acme makes forecasting simple.", ourUrl: null, senderName: "", company, contact: null });
  assert.match(b.body, /\nAcme makes forecasting simple\.\n/);
});

test("demo routes validate input before doing any work", async () => {
  const { GET } = await import("../src/app/api/live-demo/preview/route.ts");
  assert.equal((await GET(new Request("https://t.local/api/live-demo/preview?domain=localhost"))).status, 400);
  assert.equal((await GET(new Request("https://t.local/api/live-demo/preview?domain=10.0.0.1"))).status, 400);
  const { POST } = await import("../src/app/api/live-demo/run/route.ts");
  const bad = await POST(new Request("https://t.local/api/live-demo/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "not a site" }) }));
  assert.equal(bad.status, 400);
  const saved = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const off = await POST(new Request("https://t.local/api/live-demo/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "example.org" }) }));
    assert.equal(off.status, 503, "no search configured: the demo says it is unavailable");
  } finally {
    if (saved !== undefined) process.env.TAVILY_API_KEY = saved;
  }
});

test("each visitor gets a bounded number of demo runs per day", async () => {
  const visitor = `v_${Math.random().toString(36).slice(2)}`;
  const results = [];
  for (let i = 0; i < quota.DEMO_RUNS_PER_VISITOR + 1; i++) results.push(await quota.reserveDemoRun(visitor));
  assert.ok(results.slice(0, -1).every((r) => r.allowed));
  assert.deepEqual(results.at(-1), { allowed: false, reason: "visitor" });
  const req = (ip) => new Request("https://t.local", { headers: { "x-real-ip": ip } });
  assert.notEqual(quota.visitorKey(req("1.1.1.1")), quota.visitorKey(req("2.2.2.2")));
  assert.equal(quota.visitorKey(req("1.1.1.1")).length, 32);
});
