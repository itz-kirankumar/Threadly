import { test } from "node:test";
import assert from "node:assert/strict";

// Audience guard for the isolated owner-only functional preview
// (2026-10-28): OUTBOUND_ALLOWED_UIDS restricts the session-scoped outbound
// API to listed uids on a branch deployment; unset keeps default behavior.

import { outboundUidAllowed } from "../src/lib/outbound/route-guard.ts";

test("allowlist unset allows any uid (default behavior unchanged)", () => {
  delete process.env.OUTBOUND_ALLOWED_UIDS;
  assert.equal(outboundUidAllowed("anyone"), true);
});

test("allowlist set permits only listed uids, exact match", () => {
  process.env.OUTBOUND_ALLOWED_UIDS = "uid-a, uid-b";
  assert.equal(outboundUidAllowed("uid-a"), true);
  assert.equal(outboundUidAllowed("uid-b"), true);
  assert.equal(outboundUidAllowed("uid-c"), false);
  assert.equal(outboundUidAllowed("uid-a2"), false); // no prefix match
  assert.equal(outboundUidAllowed(""), false);
  delete process.env.OUTBOUND_ALLOWED_UIDS;
});

test("empty allowlist string behaves as unset", () => {
  process.env.OUTBOUND_ALLOWED_UIDS = "";
  assert.equal(outboundUidAllowed("anyone"), true);
  delete process.env.OUTBOUND_ALLOWED_UIDS;
});
