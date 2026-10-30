// Temporary new-signup restriction, owner-requested 27 Oct 2026 ("new sign
// ups only"). Existing users (any existing workspace data, or a team
// membership) keep full access. A brand-new Firebase identity can still be
// created by Google sign-in, but it cannot provision or use app data while
// this gate is on. Billing guest-claim opts out so a paid claim is never
// stranded. Invite accept does not pass through resolveWorkspaceAccess and
// stays open. Threadly is invite-only: an email invited from the beta
// waitlist (scored automatically, see lib/waitlist) may sign up. Kept
// dependency-free so it is unit-testable in plain node.

export const NEW_SIGNUP_BLOCK_MESSAGE =
  "Threadly is invite-only during the beta. Request access at gothreadly.live/#early-access; existing accounts can sign in as usual.";

export interface SignupGateInput {
  isDemo: boolean;
  adminConfigured: boolean;
  hasMembership: boolean;
  hasWorkspaceData: boolean;
  isApproved?: boolean;
}

export function decideSignupAccess(input: SignupGateInput): "allow" | "block" {
  if (input.isDemo || !input.adminConfigured) return "allow"; // demo mode and dev path
  if (input.hasMembership || input.hasWorkspaceData) return "allow"; // existing user
  if (input.isApproved) return "allow"; // invited from the beta waitlist
  return "block";
}
