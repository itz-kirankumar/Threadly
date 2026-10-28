import { test } from "node:test";
import assert from "node:assert/strict";

// Identity-resolution failures must surface as 401 (auth), never 5xx: a
// malformed or unusable token grants no access, and the status code is the
// only signal a client gets about why.

const { errorStatus } = await import("../src/lib/api-request.ts");

test("demo token with demo mode off maps to 401, not 500", () => {
  assert.equal(errorStatus(new Error("Demo mode is not enabled.")), 401);
});

test("unverifiable token maps to 401, not 502", () => {
  assert.equal(errorStatus(new Error("Your Google sign-in could not be verified.")), 401);
});

test("missing/expired sign-in stays 401", () => {
  assert.equal(errorStatus(new Error("Sign in with Google to continue.")), 401);
  assert.equal(errorStatus(new Error("Your Google sign-in expired. Please sign in again.")), 401);
});

test("genuine provider failures keep their existing mapping", () => {
  assert.equal(errorStatus(new Error("service returned HTTP 500")), 502);
  assert.equal(errorStatus(new Error("rate limit service is unavailable")), 503);
  assert.equal(errorStatus(new Error("totally unknown")), 500);
});
