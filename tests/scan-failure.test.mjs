import { test } from "node:test";
import assert from "node:assert/strict";

test("a scan where every provider fails is an actionable 502 that leaks no provider detail", async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY, g: process.env.GEMINI_API_KEY, t: process.env.TAVILY_API_KEY };
  process.env.OPENAI_API_KEY = "sk-test-secret-value";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.TAVILY_API_KEY;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-test-****alue (401)" } }), { status: 401, headers: { "content-type": "application/json" } });
  try {
    const { runScan } = await import("../src/lib/geo/engine.ts");
    const { RequestError } = await import("../src/lib/api-request.ts");
    const at = "2026-10-20T10:00:00.000Z";
    const brand = { name: "Acme", domain: "acme.io", aliases: [], category: "billing", competitors: [], createdAt: at, updatedAt: at };
    const queries = [{ id: "q1", text: "best billing software", intent: "commercial", createdAt: at }];
    await assert.rejects(runScan(brand, queries, null), (err) => {
      assert.ok(err instanceof RequestError, "expected a RequestError so the message reaches the user");
      assert.equal(err.status, 502);
      assert.match(err.message, /No AI provider returned results/);
      assert.match(err.message, /key rejected/);
      assert.match(err.message, /hello@gothreadly\.live/);
      assert.doesNotMatch(err.message, /sk-|Incorrect API key/);
      return true;
    });
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [["OPENAI_API_KEY", saved.key], ["ANTHROPIC_API_KEY", saved.a], ["GEMINI_API_KEY", saved.g], ["TAVILY_API_KEY", saved.t]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
