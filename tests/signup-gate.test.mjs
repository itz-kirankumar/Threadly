import { test } from "node:test";
import assert from "node:assert/strict";

const { decideSignupAccess, isOwnerTeamEmail, ownerTeamEmails, OWNER_EMAIL } = await import("../src/lib/geo/signup-gate.ts");

const base = { isDemo: false, adminConfigured: true, hasMembership: false, isProduction: true };

test("an account with no invite is blocked, even with old workspace data", () => {
  assert.equal(decideSignupAccess(base), "block");
  assert.equal(decideSignupAccess({ ...base, hasWorkspaceData: true }), "block");
});

test("the owner and the owner's team get in, with a verified address only", () => {
  assert.equal(decideSignupAccess({ ...base, isOwnerTeam: true, emailVerified: true }), "allow");
  assert.equal(decideSignupAccess({ ...base, isOwnerTeam: true, emailVerified: false }), "block", "a password account cannot claim the owner's address");
  assert.equal(isOwnerTeamEmail(OWNER_EMAIL.toUpperCase()), true);
  assert.equal(isOwnerTeamEmail("someone@gmail.com"), false);
  assert.ok(ownerTeamEmails("a@team.com, B@team.com").has("b@team.com"));
});

test("an approved email needs to be verified", () => {
  assert.equal(decideSignupAccess({ ...base, isApproved: true, emailVerified: true }), "allow");
  assert.equal(decideSignupAccess({ ...base, isApproved: true, emailVerified: false }), "block");
});

test("team members invited by an onboarded workspace get in", () => {
  assert.equal(decideSignupAccess({ ...base, hasMembership: true }), "allow");
});

test("without the admin database, production stays closed except to the owner team", () => {
  const noAdmin = { ...base, adminConfigured: false };
  assert.equal(decideSignupAccess(noAdmin), "block");
  assert.equal(decideSignupAccess({ ...noAdmin, isApproved: true, emailVerified: true }), "block");
  assert.equal(decideSignupAccess({ ...noAdmin, isOwnerTeam: true, emailVerified: true }), "allow");
  assert.equal(decideSignupAccess({ ...noAdmin, isProduction: false }), "allow", "local development");
});

test("the local demo identity is not gated", () => {
  assert.equal(decideSignupAccess({ ...base, isDemo: true }), "allow");
});
