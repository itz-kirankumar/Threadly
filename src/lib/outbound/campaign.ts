// Suppression and campaign authorization services.
// Pure orchestration over store interfaces; no provider or network calls.

import { randomUUID } from "node:crypto";
import type {
  Approval,
  CampaignVersion,
  Enrollment,
  MessageIntent,
  RoleId,
  Suppression,
  SuppressionReason,
} from "./types.ts";
import { suppressionTokenFor, normalizeEmail, isMaterialChange } from "./policy.ts";
import { canCancel, transition } from "./ledger.ts";

export interface CampaignStore {
  saveSuppression(s: Suppression): Promise<void>;
  findSuppression(tenantId: string, emailToken: string): Promise<Suppression | null>;
  listSuppressions(tenantId: string): Promise<Suppression[]>;

  saveCampaignVersion(c: CampaignVersion): Promise<void>;
  getCampaignVersion(tenantId: string, campaignId: string, version: number): Promise<CampaignVersion | null>;
  latestCampaignVersion(tenantId: string, campaignId: string): Promise<CampaignVersion | null>;

  saveApproval(a: Approval): Promise<void>;
  getApprovalById(tenantId: string, approvalId: string): Promise<Approval | null>;
  getApprovalForVersion(tenantId: string, campaignId: string, version: number): Promise<Approval | null>;

  saveEnrollment(e: Enrollment): Promise<void>;
  listEnrollments(tenantId: string, campaignId: string): Promise<Enrollment[]>;
  findActiveEnrollmentInGroup(tenantId: string, exclusionGroup: string): Promise<Enrollment | null>;

  listIntentsByCampaign(tenantId: string, campaignId: string): Promise<MessageIntent[]>;
  saveIntent(i: MessageIntent): Promise<void>;
}

export async function addSuppression(
  store: CampaignStore,
  input: {
    tenantId: string;
    email: string;
    reason: SuppressionReason;
    source: string;
    actor: string;
    now: Date;
  }
): Promise<{ created: boolean; suppression: Suppression }> {
  const emailToken = suppressionTokenFor(input.tenantId, input.email);
  const existing = await store.findSuppression(input.tenantId, emailToken);
  if (existing) return { created: false, suppression: existing };
  const suppression: Suppression = {
    tenantId: input.tenantId,
    suppressionId: `sup-${randomUUID()}`,
    emailToken,
    reason: input.reason,
    source: input.source,
    createdAt: input.now.toISOString(),
    createdBy: input.actor,
  };
  await store.saveSuppression(suppression);
  return { created: true, suppression };
}

export async function isSuppressed(
  store: CampaignStore,
  tenantId: string,
  email: string
): Promise<boolean> {
  const token = suppressionTokenFor(tenantId, normalizeEmail(email));
  return (await store.findSuppression(tenantId, token)) !== null;
}

const APPROVER_ROLES: RoleId[] = ["owner", "admin", "campaign_approver"];

export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignError";
  }
}

// Approve an immutable campaign version. The stored version is what gets
// approved; callers must create a new version for any material change.
export async function approveCampaign(
  store: CampaignStore,
  input: {
    tenantId: string;
    campaign: CampaignVersion;
    approverUserId: string;
    approverRole: RoleId;
    now: Date;
  }
): Promise<Approval> {
  if (!APPROVER_ROLES.includes(input.approverRole)) {
    throw new CampaignError(`role ${input.approverRole} cannot approve campaigns`);
  }
  const existing = await store.getApprovalForVersion(
    input.tenantId,
    input.campaign.campaignId,
    input.campaign.version
  );
  if (existing && !existing.revokedAt) {
    throw new CampaignError("version already has an active approval");
  }
  const approval: Approval = {
    tenantId: input.tenantId,
    approvalId: `apr-${randomUUID()}`,
    campaignId: input.campaign.campaignId,
    campaignVersion: input.campaign.version,
    approverUserId: input.approverUserId,
    approverRole: input.approverRole,
    approvedAt: input.now.toISOString(),
    revokedAt: null,
    revokedBy: null,
    createdAt: input.now.toISOString(),
    createdBy: input.approverUserId,
  };
  await store.saveApproval(approval);
  return approval;
}

// Revocation cancels all pre-dispatch work for the campaign immediately.
// Provider-accepted messages cannot be recalled; they are reported.
export async function revokeApproval(
  store: CampaignStore,
  input: {
    tenantId: string;
    approvalId: string;
    revokedBy: string;
    now: Date;
  }
): Promise<{ cancelledIntents: number; inFlightIntents: number }> {
  // Never trust a caller-held copy: authorization state is read fresh.
  const current = await store.getApprovalById(input.tenantId, input.approvalId);
  if (!current) throw new CampaignError("approval not found");
  if (current.revokedAt) throw new CampaignError("approval already revoked");
  const revoked: Approval = {
    ...current,
    revokedAt: input.now.toISOString(),
    revokedBy: input.revokedBy,
  };
  await store.saveApproval(revoked);

  let cancelledIntents = 0;
  let inFlightIntents = 0;
  const intents = await store.listIntentsByCampaign(input.tenantId, current.campaignId);
  for (const intent of intents) {
    if (intent.campaignVersion !== current.campaignVersion) continue;
    if (canCancel(intent.status)) {
      await store.saveIntent(
        transition(intent, "cancelled", {
          now: input.now,
          actor: input.revokedBy,
          reason: "approval_revoked",
        })
      );
      cancelledIntents++;
    } else {
      inFlightIntents++; // dispatching or already with the provider
    }
  }

  const enrollments = await store.listEnrollments(input.tenantId, current.campaignId);
  for (const e of enrollments) {
    if (e.status === "active" || e.status === "paused") {
      await store.saveEnrollment({ ...e, status: "cancelled" });
    }
  }

  return { cancelledIntents, inFlightIntents };
}

// Enroll a contact: one active enrollment per exclusion group, and the
// approval must cover the exact version being enrolled.
export async function enrollContact(
  store: CampaignStore,
  input: {
    tenantId: string;
    campaign: CampaignVersion;
    approvalId: string;
    contactId: string;
    exclusionGroup: string;
    actor: string;
    now: Date;
  }
): Promise<Enrollment> {
  // Fresh read: a stale caller-held approval object grants nothing.
  const approval = await store.getApprovalById(input.tenantId, input.approvalId);
  if (!approval) throw new CampaignError("approval not found");
  if (approval.revokedAt) throw new CampaignError("approval revoked");
  if (approval.campaignId !== input.campaign.campaignId) {
    throw new CampaignError("approval does not cover this campaign");
  }
  if (approval.campaignVersion !== input.campaign.version) {
    throw new CampaignError("approval does not cover this campaign version");
  }
  if (input.now.getTime() > Date.parse(input.campaign.expiresAt)) {
    throw new CampaignError("campaign expired");
  }
  const clash = await store.findActiveEnrollmentInGroup(input.tenantId, input.exclusionGroup);
  if (clash) throw new CampaignError(`exclusion group already has active enrollment ${clash.enrollmentId}`);

  const enrollment: Enrollment = {
    tenantId: input.tenantId,
    enrollmentId: `enr-${randomUUID()}`,
    campaignId: input.campaign.campaignId,
    campaignVersion: input.campaign.version,
    contactId: input.contactId,
    exclusionGroup: input.exclusionGroup,
    status: "active",
    currentStep: 0,
    createdAt: input.now.toISOString(),
    createdBy: input.actor,
  };
  await store.saveEnrollment(enrollment);
  return enrollment;
}

// Record a human reply: stops follow-ups BEFORE classification (PRD F15).
export async function recordHumanReply(
  store: CampaignStore,
  input: {
    tenantId: string;
    enrollment: Enrollment;
    intents: MessageIntent[];
    actor: string;
    now: Date;
  }
): Promise<{ cancelledIntents: number }> {
  let cancelledIntents = 0;
  for (const intent of input.intents) {
    if (intent.enrollmentId !== input.enrollment.enrollmentId) continue;
    if (canCancel(intent.status)) {
      await store.saveIntent(
        transition(intent, "cancelled", {
          now: input.now,
          actor: input.actor,
          reason: "human_reply",
        })
      );
      cancelledIntents++;
    }
  }
  await store.saveEnrollment({ ...input.enrollment, status: "replied" });
  return { cancelledIntents };
}

export function campaignVersionBump(prev: CampaignVersion, next: CampaignVersion): void {
  if (!isMaterialChange(prev, next)) {
    throw new CampaignError("no material change: new version not required");
  }
  if (next.version !== prev.version + 1) {
    throw new CampaignError("version must increment by one");
  }
}

// In-memory campaign store for tests and staging contract runs.
export class MemoryCampaignStore implements CampaignStore {
  suppressions = new Map<string, Suppression>();
  versions = new Map<string, CampaignVersion>();
  approvals = new Map<string, Approval>();
  enrollments = new Map<string, Enrollment>();
  intents = new Map<string, MessageIntent>();

  async saveSuppression(s: Suppression): Promise<void> {
    this.suppressions.set(`${s.tenantId}:${s.emailToken}`, s);
  }
  async findSuppression(tenantId: string, emailToken: string): Promise<Suppression | null> {
    return this.suppressions.get(`${tenantId}:${emailToken}`) ?? null;
  }
  async listSuppressions(tenantId: string): Promise<Suppression[]> {
    return [...this.suppressions.values()].filter((s) => s.tenantId === tenantId);
  }
  async saveCampaignVersion(c: CampaignVersion): Promise<void> {
    this.versions.set(`${c.tenantId}:${c.campaignId}:${c.version}`, c);
  }
  async getCampaignVersion(tenantId: string, campaignId: string, version: number): Promise<CampaignVersion | null> {
    return this.versions.get(`${tenantId}:${campaignId}:${version}`) ?? null;
  }
  async latestCampaignVersion(tenantId: string, campaignId: string): Promise<CampaignVersion | null> {
    const all = [...this.versions.values()].filter(
      (c) => c.tenantId === tenantId && c.campaignId === campaignId
    );
    return all.sort((a, b) => b.version - a.version)[0] ?? null;
  }
  async saveApproval(a: Approval): Promise<void> {
    this.approvals.set(a.approvalId, a);
  }
  async getApprovalById(tenantId: string, approvalId: string): Promise<Approval | null> {
    const a = this.approvals.get(approvalId);
    return a && a.tenantId === tenantId ? a : null;
  }
  async getApprovalForVersion(tenantId: string, campaignId: string, version: number): Promise<Approval | null> {
    return (
      [...this.approvals.values()].find(
        (a) => a.tenantId === tenantId && a.campaignId === campaignId && a.campaignVersion === version
      ) ?? null
    );
  }
  async saveEnrollment(e: Enrollment): Promise<void> {
    this.enrollments.set(e.enrollmentId, e);
  }
  async listEnrollments(tenantId: string, campaignId: string): Promise<Enrollment[]> {
    return [...this.enrollments.values()].filter(
      (e) => e.tenantId === tenantId && e.campaignId === campaignId
    );
  }
  async findActiveEnrollmentInGroup(tenantId: string, exclusionGroup: string): Promise<Enrollment | null> {
    return (
      [...this.enrollments.values()].find(
        (e) => e.tenantId === tenantId && e.exclusionGroup === exclusionGroup && e.status === "active"
      ) ?? null
    );
  }
  async listIntentsByCampaign(tenantId: string, campaignId: string): Promise<MessageIntent[]> {
    return [...this.intents.values()].filter(
      (i) => i.tenantId === tenantId && i.campaignId === campaignId
    );
  }
  async saveIntent(i: MessageIntent): Promise<void> {
    this.intents.set(i.intentId, i);
  }
}
