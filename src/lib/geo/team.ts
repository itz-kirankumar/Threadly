import { RequestError } from "../api-request.ts";
import { PLAN_LIMITS } from "./plan.ts";
import { getFirebaseIdentity, withWorkspace, type FirebaseIdentity } from "../portal-db.ts";
import { adminConfigured, getAdminDatabase } from "./admin-store.ts";

// Teams: a workspace (one user's geo tree) can be shared with other signed-in
// users. Membership and invite indexes live at the RTDB top level, so every
// team read/write goes through the Admin SDK; role checks happen here in the
// API layer. Without FIREBASE_ADMIN credentials teams are off and every
// caller owns only their own workspace.

export type TeamRole = "owner" | "admin" | "member";

export type TeamPermission =
  | "view"
  | "runScans"
  | "editQuestions"
  | "deleteQuestions"
  | "manageBrand"
  | "manageKeys"
  | "manageTeam";

const ROLE_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  owner: ["view", "runScans", "editQuestions", "deleteQuestions", "manageBrand", "manageKeys", "manageTeam"],
  admin: ["view", "runScans", "editQuestions", "deleteQuestions", "manageBrand", "manageKeys", "manageTeam"],
  member: ["view", "runScans", "editQuestions"],
};

export function roleAllows(role: TeamRole, permission: TeamPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface TeamMember {
  uid: string;
  email: string;
  name: string;
  role: TeamRole;
  addedAt: string;
}

export interface TeamInvite {
  token: string;
  role: Exclude<TeamRole, "owner">;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

interface Membership {
  ownerUid: string;
  role: TeamRole;
  ownerName?: string;
  workspaceName?: string;
}

export interface WorkspaceAccess {
  identity: { uid: string; email: string; name: string; idToken: string };
  workspaceUid: string;
  role: TeamRole;
  shared: boolean;
  teamsEnabled: boolean;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- membership + invite indexes (top-level, admin only) ----

export async function adminGetMembership(uid: string): Promise<Membership | null> {
  const snapshot = await (await getAdminDatabase()).ref(`memberships/${uid}`).get();
  return (snapshot.val() as Membership | null) ?? null;
}

async function adminSetMembership(uid: string, membership: Membership | null): Promise<void> {
  await (await getAdminDatabase()).ref(`memberships/${uid}`).set(membership);
}

async function adminIndexInvite(token: string, ownerUid: string | null): Promise<void> {
  await (await getAdminDatabase()).ref(`invites/${token}`).set(ownerUid);
}

async function adminInviteOwner(token: string): Promise<string | null> {
  const snapshot = await (await getAdminDatabase()).ref(`invites/${token}`).get();
  return (snapshot.val() as string | null) ?? null;
}

// ---- team records inside the owner's workspace tree ----

export async function loadTeam(ownerUid: string): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const db = await getAdminDatabase();
  const snapshot = await db.ref(`users/${ownerUid}/geo/team`).get();
  const raw = snapshot.val() as { members?: Record<string, TeamMember>; invites?: Record<string, TeamInvite> } | null;
  const now = Date.now();
  const invites = Object.values(raw?.invites ?? {})
    .filter(Boolean)
    .filter((invite) => Date.parse(invite.expiresAt) > now)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    members: Object.values(raw?.members ?? {}).filter(Boolean).sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
    invites,
  };
}

async function writeMember(ownerUid: string, member: TeamMember | null): Promise<void> {
  await (await getAdminDatabase()).ref(`users/${ownerUid}/geo/team/members/${member ? member.uid : ""}`).set(member);
}

async function writeInvite(ownerUid: string, invite: TeamInvite | null): Promise<void> {
  const token = invite ? invite.token : "";
  await (await getAdminDatabase()).ref(`users/${ownerUid}/geo/team/invites/${token}`).set(invite);
}

// ---- access resolution for every API route ----

import { NEW_SIGNUP_BLOCK_MESSAGE, decideSignupAccess, isOwnerTeamEmail } from "./signup-gate.ts";
import { isEmailApproved } from "../waitlist/store.ts";

// The invite-only decision for one identity (see signup-gate.ts). Membership
// comes from the admin store; pass it when the caller has already read it.
export async function accessDecision(identity: FirebaseIdentity, membership?: unknown): Promise<"allow" | "block"> {
  const admin = adminConfigured();
  const member = admin ? (membership !== undefined ? membership : await adminGetMembership(identity.uid)) : null;
  return decideSignupAccess({
    isDemo: identity.idToken === "demo-token",
    adminConfigured: admin,
    hasMembership: Boolean(member),
    isOwnerTeam: isOwnerTeamEmail(identity.email),
    emailVerified: identity.emailVerified === true,
    isApproved: admin && !member ? await isEmailApproved(identity.email) : false,
    isProduction: process.env.NODE_ENV === "production",
  });
}

// Throws 403 unless the caller may use the platform. Exported so billing
// routes apply the same gate to signed-in callers.
export async function assertSignupAllowed(identity: FirebaseIdentity): Promise<void> {
  if ((await accessDecision(identity)) === "block") throw new RequestError(NEW_SIGNUP_BLOCK_MESSAGE, 403);
}

export async function resolveWorkspaceAccess(request: Request, permission: TeamPermission): Promise<WorkspaceAccess> {
  const identity = await getFirebaseIdentity(request);
  if (!identity) throw new RequestError("Sign in with Google to continue.", 401);

  if (identity.idToken === "demo-token" || !adminConfigured()) {
    if ((await accessDecision(identity)) === "block") throw new RequestError(NEW_SIGNUP_BLOCK_MESSAGE, 403);
    return { identity, workspaceUid: identity.uid, role: "owner", shared: false, teamsEnabled: false };
  }

  const membership = await adminGetMembership(identity.uid);
  if ((await accessDecision(identity, membership)) === "block") throw new RequestError(NEW_SIGNUP_BLOCK_MESSAGE, 403);
  const workspaceUid = membership?.ownerUid ?? identity.uid;
  const role: TeamRole = membership?.role ?? "owner";
  if (!roleAllows(role, permission)) {
    throw new RequestError("Your role in this workspace does not allow that action.", 403);
  }
  return { identity, workspaceUid, role, shared: Boolean(membership), teamsEnabled: true };
}

export async function inWorkspace<T>(access: WorkspaceAccess, operation: () => Promise<T>): Promise<T> {
  const useAdmin = access.identity.idToken !== "demo-token" && adminConfigured();
  return withWorkspace(access.workspaceUid, access.identity.idToken, operation, { useAdmin });
}

// ---- team operations (call after resolveWorkspaceAccess with manageTeam) ----

export async function createInvite(access: WorkspaceAccess, role: Exclude<TeamRole, "owner">): Promise<TeamInvite> {
  const now = new Date();
  const invite: TeamInvite = {
    token: generateToken(),
    role,
    createdBy: access.identity.uid,
    createdByName: access.identity.name,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
  };
  await writeInvite(access.workspaceUid, invite);
  await adminIndexInvite(invite.token, access.workspaceUid);
  return invite;
}

export async function removeInvite(ownerUid: string, token: string): Promise<void> {
  await (await getAdminDatabase()).ref(`users/${ownerUid}/geo/team/invites/${token}`).set(null);
  await adminIndexInvite(token, null);
}

export async function updateMemberRole(ownerUid: string, memberUid: string, role: Exclude<TeamRole, "owner">): Promise<void> {
  const db = await getAdminDatabase();
  const snapshot = await db.ref(`users/${ownerUid}/geo/team/members/${memberUid}`).get();
  const member = snapshot.val() as TeamMember | null;
  if (!member) throw new RequestError("That member is no longer in this workspace.", 404);
  await db.ref(`users/${ownerUid}/geo/team/members/${memberUid}/role`).set(role);
  const membership = await adminGetMembership(memberUid);
  if (membership) await adminSetMembership(memberUid, { ...membership, role });
}

export async function removeMember(ownerUid: string, memberUid: string): Promise<void> {
  await (await getAdminDatabase()).ref(`users/${ownerUid}/geo/team/members/${memberUid}`).set(null);
  await adminSetMembership(memberUid, null);
}

export interface InvitePreview {
  workspaceName: string;
  inviterName: string;
  role: TeamRole;
  expired: boolean;
}

export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const ownerUid = await adminInviteOwner(token);
  if (!ownerUid) return null;
  const db = await getAdminDatabase();
  const snapshot = await db.ref(`users/${ownerUid}/geo`).get();
  const geo = snapshot.val() as { team?: { invites?: Record<string, TeamInvite> }; brand?: { brand?: string; company?: string } } | null;
  const invite = geo?.team?.invites?.[token];
  if (!invite) return null;
  return {
    workspaceName: geo?.brand?.brand || geo?.brand?.company || "a Threadly workspace",
    inviterName: invite.createdByName,
    role: invite.role,
    expired: Date.parse(invite.expiresAt) <= Date.now(),
  };
}

export async function acceptInvite(request: Request, token: string): Promise<{ workspaceName: string; role: TeamRole }> {
  const identity = await getFirebaseIdentity(request);
  if (!identity) throw new RequestError("Sign in with Google to continue.", 401);
  if (identity.idToken === "demo-token" || !adminConfigured()) {
    throw new RequestError("Team invites are not enabled yet.", 503);
  }
  const ownerUid = await adminInviteOwner(token);
  if (!ownerUid) throw new RequestError("This invite link is invalid or was revoked.", 404);
  if (ownerUid === identity.uid) throw new RequestError("This is your own workspace.", 400);

  const db = await getAdminDatabase();
  const snapshot = await db.ref(`users/${ownerUid}/geo`).get();
  const geo = snapshot.val() as {
    team?: { invites?: Record<string, TeamInvite> };
    brand?: { brand?: string; company?: string };
  } | null;
  const invite = geo?.team?.invites?.[token];
  if (!invite) throw new RequestError("This invite link is invalid or was revoked.", 404);
  if (Date.parse(invite.expiresAt) <= Date.now()) throw new RequestError("This invite link has expired.", 410);

  // Seat cap re-check at accept time: capacity can fill after the invite was
  // created. The workspace plan lives on this same geo snapshot.
  const planId = (geo as { plan?: string } | null)?.plan ?? "none";
  const seats = (PLAN_LIMITS as Record<string, { seats: number | null }>)[planId]?.seats ?? null;
  if (seats != null) {
    const memberCount = Object.keys((geo?.team as { members?: Record<string, unknown> } | undefined)?.members ?? {}).length;
    if (memberCount >= seats - 1) {
      throw new RequestError("This workspace has no seats left on its plan.", 409);
    }
  }

  const workspaceName = geo?.brand?.brand || geo?.brand?.company || "a Threadly workspace";
  const member: TeamMember = {
    uid: identity.uid,
    email: identity.email,
    name: identity.name,
    role: invite.role,
    addedAt: new Date().toISOString(),
  };
  await writeMember(ownerUid, member);
  await adminSetMembership(identity.uid, { ownerUid, role: invite.role, workspaceName });
  return { workspaceName, role: invite.role };
}
