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

test("the category is the noun phrase a site uses for itself", () => {
  assert.equal(text.categoryFromPage({ title: "Threadly — Enterprise GEO Intelligence", headings: [] }, "Threadly"), "enterprise GEO intelligence");
  assert.equal(text.categoryFromPage({ title: "Attio: The CRM for agentic revenue", headings: [] }, "Attio"), "CRM");
  assert.equal(text.categoryFromPage({ title: "Home", headings: ["Payments infrastructure for the internet"] }, "Stripe"), "payments infrastructure");
  assert.equal(text.categoryFromPage({ title: "Acme", headings: ["Hi!"] }, "Acme"), null);
});

test("category phrases come from the definition and title, not slogans or instructions", () => {
  const read = (page, name) => text.categoryPhrases({ title: null, description: null, headings: [], paragraphs: [], ...page }, name);
  const threadly = read({ title: "Threadly — Pipeline, by invitation", description: "Threadly is a private, invitation-only prospecting and AI visibility platform for eligible B2B teams.", paragraphs: ["A private intelligence desk for B2B teams"] }, "Threadly");
  assert.equal(threadly.category, "prospecting and AI visibility platform");
  assert.deepEqual(threadly.phrases, ["prospecting and AI visibility platform", "prospecting platform", "AI visibility platform"], "body-copy metaphors are not read when the definition says it");
  assert.equal(read({ title: "The AI workspace that works for you. | Notion", description: "Build Custom Agents, search across all your apps, and automate busywork. The AI workspace where teams get more done, faster." }, "Notion").category, "AI workspace");
  assert.equal(read({ title: "The only platform you need for outbound | lemlist" }, "lemlist").category, "outbound platform");
  assert.equal(read({ title: "Stripe | Financial Infrastructure to Grow Your Revenue", description: "Stripe is a financial services platform that helps all types of businesses accept payments." }, "Stripe").category, "financial services platform");
  assert.equal(read({ title: "Threadly — Pipeline, by invitation" }, "Threadly").category, null, "a slogan is not a category");
});

test("category terms separate the site's own words from buyers' synonyms, and drop broad words", () => {
  const t = text.categoryTerms(["prospecting platform", "AI visibility platform"]);
  assert.ok(t.primary.includes("prospecting") && t.primary.includes("ai visibility"));
  assert.ok(t.related.includes("lead generation") && t.related.includes("generative engine optimization"));
  assert.deepEqual(text.categoryTerms(["cloud software suite"]).primary, [], "a suite described only as cloud software has no category word of its own");
  const zoho = text.categoryAreas({ title: null, description: "Zoho is a cloud software suite offering business applications across sales, marketing, support, finance, HR, and custom app development, including CRM, Mail, Creator, Books, Desk, and Bigin.", headings: [], paragraphs: [] });
  for (const a of ["sales", "marketing", "support", "finance", "hr", "crm"]) assert.ok(zoho.includes(a), a);
  assert.ok(!zoho.includes("bigin") && !zoho.includes("mail"), "product names are not business areas");
});

test("keywords are pairs of adjacent words, without instructions or praise", () => {
  const kw = text.extractKeywords({ title: "Threadly — Pipeline, by invitation", description: "Build custom agents and get done faster. A suite trusted by millions.", headings: ["Buying signals for B2B teams"], paragraphs: [] }, "Threadly");
  assert.ok(!kw.includes("pipeline invitation"), "words across punctuation are not a pair");
  assert.ok(!kw.some((k) => /^build |faster$|trusted/.test(k)), kw.join(", "));
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

test("there is no per-visitor limit; only an owner-set daily budget can stop a run", async () => {
  for (let i = 0; i < 12; i++) assert.deepEqual(await quota.reserveDemoRun(0), { allowed: true });
  assert.equal(quota.visitorKey, undefined, "visitors are not keyed by address");
  // With a budget but no database to count against, runs are allowed.
  assert.deepEqual(await quota.reserveDemoRun(5), { allowed: true });
});

test("brand-name results only count when they are about this company", () => {
  const terms = ["prospecting", "lead generation", "ai visibility"];
  const namesake = { title: "Threadly Alternatives - iOS Concurrency", content: "Threadly is a Swift library for threads.", url: "https://ios.libhunt.com/threadly-alternatives" };
  const ours = { title: "Best Threadly alternatives", content: "Threadly is a prospecting tool; these lead generation platforms compete.", url: "https://example.com/threadly-alternatives" };
  assert.equal(steps.aboutCompany(namesake, "Threadly", "gothreadly.live", terms), false);
  assert.equal(steps.aboutCompany(ours, "Threadly", "gothreadly.live", terms), true);
  const qs = steps.competitorQueries("Notion", "notion.com", ["AI workspace"], [], []);
  assert.deepEqual(qs.map((q) => q.q), ["Notion alternatives", "Notion competitors", "Notion vs", "best AI workspace software"]);
  assert.ok(qs.filter((q) => q.q.startsWith("Notion")).every((q) => q.brand), "brand queries are checked");
});

test("a competitor must sell in the category on its own homepage", () => {
  const primary = ["ai workspace", "workspace"];
  const related = ["wiki", "knowledge base", "docs", "project management"];
  assert.ok(steps.competitorMatch("Coda: your all-in-one collaborative workspace", 3, primary, related));
  assert.ok(steps.competitorMatch("ClickUp: one app for projects, docs and wiki", 3, primary, related), "consensus plus synonyms");
  assert.equal(steps.competitorMatch("Zapier: automate AI workflows across 8,000 apps", 5, primary, related), null, "an integration partner named often is not a competitor");
  assert.equal(steps.competitorMatch("Kimco: cloud phone system for teams", 1, primary, related), null);
});

test("customers are read from competitors' customer-story pages", () => {
  const hit = (title, url) => ({ title, url, content: "", domain: "x", published: null });
  assert.deepEqual(steps.caseStudyCustomer(hit("How Intercom PMMs save one day a month working in Coda - Coda", "https://coda.io/solutions/case-studies/intercom"), "Coda"), { name: "Intercom", slug: "intercom" });
  assert.equal(steps.caseStudyCustomer(hit("Ashby CRM Customer Success: 4X More Meetings with Apollo.io", "https://www.apollo.io/magazine/ashby-customer-story"), "Apollo")?.name, "Ashby");
  assert.equal(steps.caseStudyCustomer(hit("Case studies and customer stories - Coda", "https://coda.io/solutions/case-studies"), "Coda"), null, "the listing page is not a customer");
  assert.equal(steps.caseStudyCustomer(hit("How to plan an effective user research study.", "https://coda.io/blog/product-teams/how-to-plan"), "Coda"), null);
  assert.ok(steps.domainMatchesName("builtin.com", "Built In"));
  assert.ok(steps.domainMatchesName("hugeinc.com", "Huge"));
  assert.ok(!steps.domainMatchesName("intercom.com", "Qualtrics"));
});

test("a company's own team page names its decision makers", async () => {
  const people = await import("../src/lib/prospecting/people.ts");
  const html = `<nav>About Us</nav><h2>Our Leadership</h2>
    <div class="card"><h3>Jane Doe</h3><p>Co-founder &amp; CEO</p></div>
    <div class="card"><h3>Ravi Kumar</h3><span>VP of Sales</span></div>
    <li>Maria García, Head of Marketing</li>
    <div><h3>Read More</h3><p>Director of everything</p></div>`;
  const found = people.extractPeople(html);
  assert.deepEqual(found.map((p) => p.name), ["Jane Doe", "Ravi Kumar", "Maria García"]);
  assert.equal(found[0].title, "Co-founder & CEO");
  const ranked = people.rankForRoles(found, ["Head of Sales", "VP Sales"]);
  assert.equal(ranked[0].name, "Ravi Kumar", "the campaign's role comes first");
});

test("names several comparison results agree on become competitor candidates", () => {
  const r = (content) => ({ title: "Top Zoho alternatives", content });
  const names = steps.namesInResults([
    r("The best Zoho alternatives are HubSpot, Salesforce and Odoo. Pricing starts free."),
    r("Compare Zoho with Odoo, Freshworks, Salesforce and HubSpot for small business CRM."),
    r("Today Odoo and HubSpot lead, with Salesforce close; Bitrix24 is cheaper. Read More."),
    r("Salesforce vs HubSpot vs Odoo: features and pricing."),
  ], "Zoho");
  assert.deepEqual(names.slice(0, 3).map((n) => n.name), ["HubSpot", "Odoo", "Salesforce"]);
  assert.ok(!names.some((n) => ["Zoho", "Pricing", "Read", "More", "CRM"].includes(n.name)), "the company itself and page words are not names");
  assert.ok(!names.some((n) => n.name === "Bitrix24"), "one mention is not agreement");
});

test("headline capitals and sentence starts are not company names", () => {
  const names = steps.namesInResults([
    { title: "B2B Prospecting Tools Ranked: Top 10 Sales Intelligence Tools", content: "Prospecting is hard. We compared Apollo and ZoomInfo." },
    { title: "Best Prospecting Software", content: "Prospecting needs data. Teams like Apollo and ZoomInfo." },
    { title: "Prospecting Visibility Report", content: "Visibility matters. Many use Apollo, ZoomInfo and Prospecting tools." },
  ], "Threadly", ["prospecting platform", "prospecting"]);
  assert.deepEqual(names.map((n) => n.name), ["Apollo", "ZoomInfo"]);
});

test("news and blog pages are not customer stories", () => {
  const hit = (title, url) => ({ title, url, content: "", domain: "x", published: null });
  assert.equal(steps.caseStudyCustomer(hit("Agentforce in Action: Customer Success Stories - Salesforce", "https://www.salesforce.com/news/stories/agentforce-customer-success-stories"), "Salesforce"), null);
  assert.equal(steps.caseStudyCustomer(hit("KLM handles record daily volumes of support cases with Salesforce.", "https://www.salesforce.com/eu/customer-stories/klm"), "Salesforce")?.name, "Klm");
});

test("public profile results are matched to the company, not to namesakes", async () => {
  const people = await import("../src/lib/prospecting/people.ts");
  const shahin = people.profileFromResult({ title: "Shahin Hoda - Founder at xGrowth | Host of Growth Colony - LinkedIn", url: "https://au.linkedin.com/in/shoda", content: "Headline: Director at xGrowth | Building predictable B2B pipelines Current role: Founder" });
  assert.deepEqual({ name: shahin.name, url: shahin.url, country: shahin.country }, { name: "Shahin Hoda", url: "https://www.linkedin.com/in/shoda", country: "au" });
  assert.ok(people.profileMatchesCompany(shahin, { name: "xGrowth", domain: "xgrowth.com.au" }));
  const egypt = people.profileFromResult({ title: "Ahmed El-Hefnawy - Co-CEO | XGrowth", url: "https://eg.linkedin.com/in/ahmed", content: "" });
  assert.equal(people.profileMatchesCompany(egypt, { name: "xGrowth", domain: "xgrowth.com.au" }), false, "same name, other country");
  const namesake = people.profileFromResult({ title: "Allan Taylor - Founding Partner at Taylor Co. Ltd.", url: "https://www.linkedin.com/in/allan-taylor-1", content: "" });
  assert.equal(people.profileMatchesCompany(namesake, { name: "Allan Taylor & Co", domain: "allantaylorbrokers.com" }), false, "a person named like the company is not at it");
  assert.equal(people.profileFromResult({ title: "xGrowth | LinkedIn", url: "https://au.linkedin.com/company/xgrowth", content: "" }), null, "company pages are not people");
  assert.equal(people.profileTitle(shahin), "Director");
});

test("a sentence that mentions a partner is not a job title", async () => {
  const people = await import("../src/lib/prospecting/people.ts");
  const found = people.extractPeople("<h3>Welsh Sports</h3><p>: 2buy2 is a proud partner of the</p><h3>Joe Brown</h3><p>Cofounder &amp; CEO</p>");
  assert.deepEqual(found.map((p) => p.name), ["Joe Brown"]);
});

test("a competitor's own customers page lists its stories", () => {
  const html = `<a href="/customers/intercom">Intercom</a><a href="/customers/figma"><span>Read the story</span></a><a href="https://coda.io/blog/x">Blog</a><a href="https://other.com/customers/y">Other</a>`;
  const links = steps.storyLinksIn(html, "https://coda.io/customers", "coda.io");
  assert.deepEqual(links.map((l) => l.url), ["https://coda.io/customers/intercom", "https://coda.io/customers/figma"]);
  assert.equal(steps.caseStudyCustomer(links[1], "Coda")?.name, "Figma", "link text like \"Read the story\" falls back to the slug");
});

test("a company's name must appear as a whole word in the profile headline", async () => {
  const people = await import("../src/lib/prospecting/people.ts");
  const p = people.profileFromResult({ title: "Tom Michel - Founder AdEngineStrategies | LinkedIn", url: "https://www.linkedin.com/in/tom", content: "" });
  assert.equal(people.profileMatchesCompany(p, { name: "Engine", domain: "engine.com" }), false);
  const q = people.profileFromResult({ title: "Eric Lammertsma - Head of Product @ Docfield ➤ Driving exceptional results | LinkedIn", url: "https://www.linkedin.com/in/eric", content: "" });
  assert.ok(people.profileMatchesCompany(q, { name: "Docfield", domain: "docfield.com" }));
  assert.equal(people.profileTitle(q), "Head of Product");
});

test("a team page's headshot is the image named for the person", async () => {
  const people = await import("../src/lib/prospecting/people.ts");
  const html = `<img src="/logo.svg" alt="Acme"><div><img data-src="/team/jane.jpg" alt="Jane Doe, CEO"><h3>Jane Doe</h3></div><img src="http://insecure.example/x.jpg" alt="Ravi Kumar">`;
  assert.equal(people.photoFor(html, "Jane Doe", "https://acme.com/about"), "https://acme.com/team/jane.jpg");
  assert.equal(people.photoFor(html, "Ravi Kumar", "https://acme.com/about"), null, "only https images");
  assert.equal(people.photoFor(html, "Maria Lopez", "https://acme.com/about"), null);
});
