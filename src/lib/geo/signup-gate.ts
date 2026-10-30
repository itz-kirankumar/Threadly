// Invite-only access. A signed-in identity reaches the platform only as:
//   - the owner or the owner's team (OWNER_TEAM_EMAILS plus the owner),
//   - an email approved through the eligibility checks (lib/waitlist),
//   - a member of a team, invited by an onboarded workspace.
// Everyone else is refused, including accounts with old workspace data:
// users/ is client-writable, so nothing stored there can prove eligibility.
// Email-based routes need a verified address, or anyone could register an
// approved address with a password. Kept dependency-free so it is
// unit-testable in plain node.

export const OWNER_EMAIL = "kiran160703kumar@gmail.com";

export const NEW_SIGNUP_BLOCK_MESSAGE =
  "Threadly is invite-only. This account has not been onboarded. Check your eligibility at gothreadly.live.";

export interface SignupGateInput {
  isDemo: boolean;
  adminConfigured: boolean;
  hasMembership: boolean;
  isApproved?: boolean;
  isOwnerTeam?: boolean;
  emailVerified?: boolean;
  isProduction?: boolean;
}

export function ownerTeamEmails(extra = process.env.OWNER_TEAM_EMAILS ?? ""): Set<string> {
  return new Set([OWNER_EMAIL, ...extra.split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function isOwnerTeamEmail(email: string | null | undefined): boolean {
  return Boolean(email) && ownerTeamEmails().has(String(email).trim().toLowerCase());
}

export function decideSignupAccess(input: SignupGateInput): "allow" | "block" {
  if (input.isDemo) return "allow"; // local demo identity
  if (input.isOwnerTeam && input.emailVerified) return "allow";
  // Without the admin database nothing can be checked: open in development,
  // closed in production.
  if (!input.adminConfigured) return input.isProduction ? "block" : "allow";
  if (input.hasMembership) return "allow"; // invited by an onboarded workspace
  if (input.isApproved && input.emailVerified) return "allow";
  return "block";
}
