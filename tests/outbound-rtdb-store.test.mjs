import { test } from "node:test";
import assert from "node:assert/strict";

const { intentKeyHash, tenantRoot } = await import("../src/lib/outbound/rtdb-store.ts");

test("intent key hash is deterministic, hex, fixed length", () => {
  const a = intentKeyHash("t1:e1:v1:s1");
  assert.equal(a, intentKeyHash("t1:e1:v1:s1"));
  assert.notEqual(a, intentKeyHash("t1:e1:v1:s2"));
  assert.match(a, /^[0-9a-f]{40}$/);
});

test("tenant root validates charset and scopes paths", () => {
  assert.equal(tenantRoot("ws_abc-123_XYZ"), "outbound/ws_abc-123_XYZ");
  for (const bad of ["a/b", "a.b", "a$b", "a#b", "a[b", "", "x".repeat(129)]) {
    assert.throws(() => tenantRoot(bad), /invalid tenant/);
  }
});
