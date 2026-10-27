// RTDB-backed CampaignStore. Same isolation contract as RtdbLedgerStore:
// every path is rooted at outbound/<tenantId>/... and every read verifies
// the stored tenantId matches the request. Emails are never stored in
// suppression paths or indexes; only the HMAC token from policy.ts.

import type {
  Approval,
  CampaignVersion,
  Enrollment,
  MessageIntent,
  Suppression,
} from "./types.ts";
import type { CampaignStore } from "./campaign.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function safeKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("invalid key");
  return id;
}

export class RtdbCampaignStore implements CampaignStore {
  async saveSuppression(s: Suppression): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(s.tenantId)}/suppressions/${safeKey(s.emailToken)}`).set(s);
  }

  async findSuppression(tenantId: string, emailToken: string): Promise<Suppression | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/suppressions/${safeKey(emailToken)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Suppression;
    return val.tenantId === tenantId ? val : null;
  }

  async listSuppressions(tenantId: string): Promise<Suppression[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/suppressions`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, Suppression>).filter((s) => s.tenantId === tenantId);
  }

  async saveCampaignVersion(c: CampaignVersion): Promise<void> {
    const database = await db();
    const root = tenantRoot(c.tenantId);
    await database.ref(`${root}/campaigns/${safeKey(c.campaignId)}/versions/${c.version}`).set(c);
    await database.ref(`${root}/campaigns/${safeKey(c.campaignId)}/latest`).set(c.version);
  }

  async getCampaignVersion(tenantId: string, campaignId: string, version: number): Promise<CampaignVersion | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/campaigns/${safeKey(campaignId)}/versions/${version}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as CampaignVersion;
    return val.tenantId === tenantId ? val : null;
  }

  async latestCampaignVersion(tenantId: string, campaignId: string): Promise<CampaignVersion | null> {
    const database = await db();
    const root = tenantRoot(tenantId);
    const latestSnap = await database.ref(`${root}/campaigns/${safeKey(campaignId)}/latest`).get();
    if (!latestSnap.exists()) return null;
    return this.getCampaignVersion(tenantId, campaignId, latestSnap.val() as number);
  }

  async listCampaigns(tenantId: string): Promise<CampaignVersion[]> {
    const database = await db();
    const root = tenantRoot(tenantId);
    const snap = await database.ref(`${root}/campaigns`).get();
    if (!snap.exists()) return [];
    const ids = Object.keys(snap.val() as Record<string, unknown>);
    const out: CampaignVersion[] = [];
    for (const id of ids) {
      const latest = await this.latestCampaignVersion(tenantId, id);
      if (latest) out.push(latest);
    }
    return out;
  }

  async saveApproval(a: Approval): Promise<void> {
    const database = await db();
    const root = tenantRoot(a.tenantId);
    await database.ref(`${root}/approvals/${safeKey(a.approvalId)}`).set(a);
    await database.ref(`${root}/approvalByVersion/${safeKey(a.campaignId)}/${a.campaignVersion}`).set(a.approvalId);
  }

  async getApprovalById(tenantId: string, approvalId: string): Promise<Approval | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/approvals/${safeKey(approvalId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Approval;
    return val.tenantId === tenantId ? val : null;
  }

  async getApprovalForVersion(tenantId: string, campaignId: string, version: number): Promise<Approval | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/approvalByVersion/${safeKey(campaignId)}/${version}`).get();
    if (!snap.exists()) return null;
    return this.getApprovalById(tenantId, snap.val() as string);
  }

  async saveEnrollment(e: Enrollment): Promise<void> {
    const database = await db();
    const root = tenantRoot(e.tenantId);
    await database.ref(`${root}/enrollments/${safeKey(e.enrollmentId)}`).set(e);
    await database.ref(`${root}/enrollmentByCampaign/${safeKey(e.campaignId)}/${safeKey(e.enrollmentId)}`).set(true);
  }

  async listEnrollments(tenantId: string, campaignId: string): Promise<Enrollment[]> {
    const database = await db();
    const root = tenantRoot(tenantId);
    const idx = await database.ref(`${root}/enrollmentByCampaign/${safeKey(campaignId)}`).get();
    if (!idx.exists()) return [];
    const ids = Object.keys(idx.val() as Record<string, boolean>);
    const out: Enrollment[] = [];
    for (const id of ids) {
      const snap = await database.ref(`${root}/enrollments/${safeKey(id)}`).get();
      if (!snap.exists()) continue;
      const val = snap.val() as Enrollment;
      if (val.tenantId === tenantId) out.push(val);
    }
    return out;
  }

  async findActiveEnrollmentInGroup(tenantId: string, exclusionGroup: string): Promise<Enrollment | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/enrollments`).get();
    if (!snap.exists()) return null;
    const all = Object.values(snap.val() as Record<string, Enrollment>);
    return (
      all.find(
        (e) => e.tenantId === tenantId && e.exclusionGroup === exclusionGroup && e.status === "active"
      ) ?? null
    );
  }

  async listIntentsByCampaign(tenantId: string, campaignId: string): Promise<MessageIntent[]> {
    const database = await db();
    const root = tenantRoot(tenantId);
    const idx = await database.ref(`${root}/intentByCampaign/${safeKey(campaignId)}`).get();
    if (!idx.exists()) return [];
    const ids = Object.keys(idx.val() as Record<string, boolean>);
    const out: MessageIntent[] = [];
    for (const id of ids) {
      const snap = await database.ref(`${root}/intents/${safeKey(id)}`).get();
      if (!snap.exists()) continue;
      const val = snap.val() as MessageIntent;
      if (val.tenantId === tenantId) out.push(val);
    }
    return out;
  }

  async saveIntent(i: MessageIntent): Promise<void> {
    const database = await db();
    const root = tenantRoot(i.tenantId);
    await database.ref(`${root}/intents/${safeKey(i.intentId)}`).set(i);
    await database.ref(`${root}/intentByCampaign/${safeKey(i.campaignId)}/${safeKey(i.intentId)}`).set(true);
  }
}
