import { test } from "node:test";
import assert from "node:assert/strict";

const { decideSignupAccess } = await import("../src/lib/geo/signup-gate.ts");

test("blocks a brand-new identity with no membership and no data", () => {
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: false, allowNewSignup: false }),
    "block"
  );
});

test("allows existing users: workspace data or team membership", () => {
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: true, allowNewSignup: false }),
    "allow"
  );
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: true, hasWorkspaceData: false, allowNewSignup: false }),
    "allow"
  );
});

test("demo mode and non-admin dev path are never gated", () => {
  assert.equal(
    decideSignupAccess({ isDemo: true, adminConfigured: true, hasMembership: false, hasWorkspaceData: false, allowNewSignup: false }),
    "allow"
  );
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: false, hasMembership: false, hasWorkspaceData: false, allowNewSignup: false }),
    "allow"
  );
});

test("billing claim opt-out allows a new paid claimant", () => {
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: false, allowNewSignup: true }),
    "allow"
  );
});
