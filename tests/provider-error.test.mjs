import { test } from "node:test";
import assert from "node:assert/strict";

const { classifyProviderError, PROVIDER_ERROR_LABELS } = await import("../src/lib/geo/provider-error.ts");

test("auth failures", () => {
  assert.equal(classifyProviderError("ChatGPT: HTTP 401"), "auth");
  assert.equal(classifyProviderError("Claude: authentication_error: invalid x-api-key"), "auth");
  assert.equal(classifyProviderError("Gemini: HTTP 403 permission denied"), "auth");
});

test("rate limit and quota", () => {
  assert.equal(classifyProviderError("Gemini: HTTP 429 too many requests"), "rate_limited");
  assert.equal(classifyProviderError("Claude: rate limit exceeded"), "rate_limited");
  assert.equal(classifyProviderError("OpenAI: insufficient_quota: billing hard limit reached"), "quota");
});

test("timeout and no-answer", () => {
  assert.equal(classifyProviderError("ChatGPT: The operation timed out"), "timeout");
  assert.equal(classifyProviderError("Claude returned no answer."), "no_answer");
});

test("http classes", () => {
  assert.equal(classifyProviderError("Gemini: HTTP 503 model overloaded"), "http_5xx");
  assert.equal(classifyProviderError("ChatGPT: HTTP 404 model not found"), "http_4xx");
});

test("network and unknown", () => {
  assert.equal(classifyProviderError("fetch failed: ENOTFOUND api.openai.com"), "network");
  assert.equal(classifyProviderError("something odd happened"), "unknown");
  assert.equal(classifyProviderError(""), "unknown");
});

test("every class has a label and labels never contain raw messages", () => {
  for (const cls of ["auth","rate_limited","quota","timeout","no_answer","http_4xx","http_5xx","network","unknown"]) {
    assert.ok(PROVIDER_ERROR_LABELS[cls], `label for ${cls}`);
  }
  const secretish = "HTTP 401 invalid key sk-abc123SECRET";
  const cls = classifyProviderError(secretish);
  assert.ok(!PROVIDER_ERROR_LABELS[cls].includes("sk-abc123SECRET"));
});
