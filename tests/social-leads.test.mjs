import { test } from "node:test";
import assert from "node:assert/strict";

const social = await import("../src/lib/prospecting/social.ts");

test("buying intent is read from the post; guides and launches are content, not buyers", () => {
  assert.equal(social.classifyIntent("best tool to track AI visibility? any suggestions").intent, "asking for a recommendation");
  assert.equal(social.classifyIntent("Anyone using alternatives to Profound Enterprise?").intent, "looking for an alternative");
  assert.equal(social.classifyIntent("How do I get cited by ChatGPT?").intent, "asking for help");
  const guide = "AI Search Optimisation: The Complete Guide to Getting Cited";
  assert.equal(social.classifyIntent(guide, guide).intent, "discussing the topic");
  const launch = "New Launch: AI Search Visibility Monitor - any feedback?";
  assert.equal(social.classifyIntent(launch, launch).score, 0);
});

test("authors and communities come only from the public post URL", () => {
  assert.deepEqual(social.postAuthor("https://www.reddit.com/r/aeo/comments/abc/what_tools/"), { author: null, community: "r/aeo" });
  assert.deepEqual(social.postAuthor("https://x.com/ayush/status/123"), { author: "@ayush", community: null });
  assert.deepEqual(social.postAuthor("https://www.linkedin.com/posts/jane-doe_ai-search-activity-1"), { author: "jane-doe", community: null });
  assert.deepEqual(social.postAuthor("not a url"), { author: null, community: null });
});

const sender = { name: "Acme", domain: "acme.io", summary: "The forecasting platform for revenue teams.", category: "Revenue forecasting", keywords: ["forecasting", "pipeline"] };

test("a composed email quotes the prospect and introduces the sender, without template placeholders", async () => {
  const d = await social.draftCompanyEmail(sender, { name: "Beta", domain: "beta.com", description: "Beta helps finance teams close the books with pipeline data." });
  assert.equal(d.engine, "composed");
  assert.match(d.body, /I was reading how Beta describes itself: "Beta helps finance teams close the books with pipeline data\."/);
  assert.match(d.body, /Acme is the forecasting platform for revenue teams\./);
  assert.match(d.subject, /Beta and pipeline/);
  assert.equal(d.body.split("\n").at(-1), "The Acme team", "signs off as the searched company's team");
  assert.doesNotMatch(d.body, /\{\{|\[One sentence/);
  assert.deepEqual(d.sources, ["https://beta.com/", "https://acme.io/"]);
});

test("a social reply answers the post first and discloses the sender", async () => {
  const lead = { platform: "Reddit", url: "https://reddit.com/r/x/comments/1/", title: "Alternatives to Foo?", snippet: "", author: null, community: "r/x", intent: "looking for an alternative", intentScore: 3, query: "q" };
  const r = await social.draftSocialReply(sender, lead);
  assert.match(r.body, /^If you are comparing options/);
  assert.match(r.body, /Disclosure, I work at Acme\. Acme is the forecasting platform for revenue teams\./);
});

test("with no search configured there are no leads and no requests", async () => {
  const saved = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    assert.deepEqual(await social.findSocialLeads({ topic: "anything", competitors: [], primary: [], related: [], brand: "Acme" }, () => {}), []);
  } finally {
    if (saved !== undefined) process.env.TAVILY_API_KEY = saved;
  }
});

test("the social search topic skips page copy that reads as a sentence", () => {
  assert.equal(social.socialTopic("What our customers got out of it", ["personalized emails", "105m companies"], "Explee"), "personalized emails");
  assert.equal(social.socialTopic("Revenue forecasting", ["pipeline"], "Acme"), "Revenue forecasting");
  assert.equal(social.socialTopic("", ["105m companies", "leads"], "Acme"), "105m companies");
});

test("an imperative tagline reads as what the sender lets you do", async () => {
  const s = { ...sender, name: "Explee", domain: "explee.com", summary: "Enter your domain and let AI find ideal customers.", keywords: [] };
  const d = await social.draftCompanyEmail(s, { name: "Stripe", domain: "stripe.com", description: "Stripe is a payments platform." });
  assert.match(d.body, /With Explee, you can enter your domain and let AI find ideal customers\./);
  assert.doesNotMatch(d.body, /we build enter/);
});

test("post dates come from X and LinkedIn ids, and old posts are dropped", () => {
  assert.equal(social.postDate("https://x.com/a/status/1800000000000000000").slice(0, 7), "2024-06");
  assert.equal(social.postDate("https://www.linkedin.com/posts/jo_topic-activity-7200000000000000000-abcd").slice(0, 7), "2024-05");
  assert.equal(social.postDate("https://reddit.com/r/x/comments/1/", "Tue, 01 Oct 2026 00:00:00 GMT").slice(0, 10), "2026-10-01");
  assert.equal(social.postDate("https://reddit.com/r/x/comments/1/"), null);
  const now = Date.parse("2026-10-30T00:00:00Z");
  assert.equal(social.isRecentPost("2024-06-01T00:00:00Z", now), false);
  assert.equal(social.isRecentPost("2026-06-01T00:00:00Z", now), true);
  assert.equal(social.isRecentPost(null, now), true);
});

test("a post counts only when its title names a competitor or the category", () => {
  const input = { competitors: ["Salesforce", "HubSpot", "Clay"], primary: ["crm"], related: ["sales", "marketing", "finance", "customer relationship"], brand: "Zoho" };
  assert.ok(social.postRelevance("Best CRM for a 10 person team?", "", input));
  assert.ok(social.postRelevance("Moving off Salesforce, what next?", "", input));
  assert.equal(social.postRelevance("Marketing/sales/finance career path recommendations?", "", input), null, "broad words alone are not the market");
  assert.equal(social.postRelevance("Best clay for pottery beginners?", "", input), null, "a brand that is a common word needs the category too");
  assert.ok(social.postRelevance("Which tool should I pick?", "We are deciding between HubSpot and Salesforce", input), "a competitor named in the post body");
});

test("launches, self-promotion and careers are not people asking", () => {
  assert.equal(social.classifyIntent("Affine: Open Source Alternative to Notion, Miro, Airtable", undefined, "LinkedIn").score, 0);
  assert.equal(social.classifyIntent("I made a free and open-source alternative to Obsidian", undefined, "Reddit").score, 0);
  assert.equal(social.classifyIntent("Marketing/sales/finance career path recommendations?").score, 0);
  assert.equal(social.classifyIntent("Obsidian Alternatives for Cloud, Teams, and Documentation", undefined, "LinkedIn").score, 0);
  assert.equal(social.classifyIntent("Anyone moved from ZoomInfo to Clay for prospecting?").intent, "looking for an alternative");
  assert.equal(social.classifyIntent("Looking for a CRM that works for a small agency?", undefined, "LinkedIn").intent, "asking for a recommendation");
});

test("X posts show their text, not the author's name", () => {
  assert.equal(social.postTitle("X", 'Tom on X: "Open-source Obsidian Publish alternative" / X', ""), "Open-source Obsidian Publish alternative");
  assert.equal(social.postTitle("X", "Giri Kunche", "Giri Kunche on X: Looking for a better CRM than HubSpot"), "Looking for a better CRM than HubSpot");
});

test("the lead topic is the category said the way buyers ask", () => {
  assert.equal(social.leadTopic(["prospecting and AI visibility platform", "prospecting platform", "AI visibility platform"], [], "x"), "prospecting tool");
  assert.equal(social.leadTopic(["AI workspace"], [], "x"), "AI workspace");
  assert.equal(social.leadTopic(["financial services platform"], ["payment processing", "payments"], "x"), "payment processing");
});
