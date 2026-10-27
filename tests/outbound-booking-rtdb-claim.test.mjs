import { test } from "node:test";
import assert from "node:assert/strict";

const { linkClaimable } = await import("../src/lib/outbound/rtdb-booking-store.ts");

// Regression for the live failure found in validation run 8: RTDB drops null
// fields on write, so a freshly created link reads back WITHOUT usedAt and
// claimState keys. A strict `=== null` check made every first claim fail with
// 409 booking_in_progress_or_used on the real store while all memory-store
// tests passed.
test("fresh RTDB link (null fields absent) is claimable", () => {
  const asStored = { tenantId: "t1", bookingLinkId: "bkl_1", tokenHash: "h", contactId: "c1", organizerSenderId: "s1", policyId: "p1", expiresAt: "2027-01-01T00:00:00Z", createdAt: "2026-10-28T00:00:00Z", createdBy: "u1" };
  assert.equal(linkClaimable(asStored), true);
  assert.equal(linkClaimable({ ...asStored, usedAt: null, claimState: null }), true);
  assert.equal(linkClaimable({ ...asStored, usedAt: "2026-10-28T01:00:00Z" }), false);
  assert.equal(linkClaimable({ ...asStored, claimState: "claiming" }), false);
  assert.equal(linkClaimable({ ...asStored, claimState: "claim_unknown" }), false);
  assert.equal(linkClaimable(null), false);
});
