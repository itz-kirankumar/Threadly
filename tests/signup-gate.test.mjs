import { test } from "node:test";
import assert from "node:assert/strict";

const { decideSignupAccess } = await import("../src/lib/geo/signup-gate.ts");

test("blocks a brand-new identity with no membership and no data", () => {
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: false }),
    "block"
  );
});

test("allows existing users: workspace data or team membership", () => {
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: true }),
    "allow"
  );
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: true, hasWorkspaceData: false }),
    "allow"
  );
});

test("demo mode and non-admin dev path are never gated", () => {
  assert.equal(
    decideSignupAccess({ isDemo: true, adminConfigured: true, hasMembership: false, hasWorkspaceData: false }),
    "allow"
  );
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: false, hasMembership: false, hasWorkspaceData: false }),
    "allow"
  );
});

test("no billing opt-out: a signed-in purchaser with no existing data is blocked before claim", () => {
  assert.equal(
    decideSignupAccess({ isDemo: false, adminConfigured: true, hasMembership: false, hasWorkspaceData: false }),
    "block"
  );
});
