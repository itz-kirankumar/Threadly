import { test } from "node:test";
import assert from "node:assert/strict";

const { parseRobotsGroups, robotsAllowsPath } = await import("../src/lib/geo/openseo-engine.ts");

// The exact live robots.txt of https://www.gothreadly.live (fetched 2026-10-28).
const LIVE_ROBOTS = `User-Agent: *
Allow: /
Disallow: /api/
Disallow: /portal/

User-Agent: GPTBot
User-Agent: ChatGPT-User
User-Agent: PerplexityBot
User-Agent: ClaudeBot
User-Agent: Amazonbot
Allow: /
Allow: /demo
Allow: /pricing
Allow: /docs
Allow: /blog
Allow: /security
Allow: /terms
Allow: /privacy
Disallow: /api/
Disallow: /portal/

Sitemap: https://www.gothreadly.live/sitemap.xml
`;

test("multi-agent group parses as one group sharing its rules", () => {
  const groups = parseRobotsGroups(LIVE_ROBOTS);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[1].agents, ["gptbot", "chatgpt-user", "perplexitybot", "claudebot", "amazonbot"]);
  assert.equal(groups[1].rules.length, 10);
});

test("live robots.txt: named AI bots are ALLOWED, not blocked (regression)", () => {
  const groups = parseRobotsGroups(LIVE_ROBOTS);
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "ChatGPT-User", "Amazonbot"]) {
    assert.equal(robotsAllowsPath(groups, bot, "/"), "allowed", `${bot} must be allowed at /`);
    assert.equal(robotsAllowsPath(groups, bot, "/api/health"), "blocked", `${bot} must be blocked at /api/`);
  }
});

test("unlisted agent falls back to the wildcard group", () => {
  const groups = parseRobotsGroups(LIVE_ROBOTS);
  assert.equal(robotsAllowsPath(groups, "Google-Extended", "/"), "allowed");
  assert.equal(robotsAllowsPath(groups, "Google-Extended", "/portal/x"), "blocked");
  assert.equal(robotsAllowsPath(groups, "CCBot", "/"), "allowed");
});

test("longest match governs; allow wins ties; root disallow blocks", () => {
  const g = parseRobotsGroups("User-agent: TestBot\nDisallow: /\nAllow: /public\n");
  assert.equal(robotsAllowsPath(g, "TestBot", "/"), "blocked");
  assert.equal(robotsAllowsPath(g, "TestBot", "/public/page"), "allowed");
  const tie = parseRobotsGroups("User-agent: TestBot\nDisallow: /docs\nAllow: /docs\n");
  assert.equal(robotsAllowsPath(tie, "TestBot", "/docs"), "allowed");
});

test("empty Disallow path means nothing is disallowed", () => {
  const g = parseRobotsGroups("User-agent: TestBot\nDisallow:\n");
  assert.equal(robotsAllowsPath(g, "TestBot", "/"), "allowed");
});

test("no matching group returns null; comments and case are handled", () => {
  const g = parseRobotsGroups("# comment only\nUser-agent: *\nDisallow: /admin # trailing comment\n");
  assert.equal(robotsAllowsPath(g, "AnythingBot", "/admin/panel"), "blocked");
  assert.equal(robotsAllowsPath(g, "AnythingBot", "/"), "allowed");
  const empty = parseRobotsGroups("Sitemap: https://x/sitemap.xml\n");
  assert.equal(robotsAllowsPath(empty, "GPTBot", "/"), null);
});
