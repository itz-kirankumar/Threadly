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
    assert.deepEqual(await social.findSocialLeads("anything", [], () => {}), []);
  } finally {
    if (saved !== undefined) process.env.TAVILY_API_KEY = saved;
  }
});
