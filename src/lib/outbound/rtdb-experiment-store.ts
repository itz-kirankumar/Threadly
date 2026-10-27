import type { Experiment } from "./types.ts";
import { rtdbCasPut, tenantRoot } from "./rtdb-store.ts";
import type { ExperimentStore } from "./experiments.ts";

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

export class RtdbExperimentStore implements ExperimentStore {
  async saveExperiment(e: Experiment): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(e.tenantId)}/experiments/${safeKey(e.experimentId)}`).set(e);
  }

  async getExperiment(tenantId: string, experimentId: string): Promise<Experiment | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/experiments/${safeKey(experimentId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Experiment;
    // RTDB drops null fields on write: variantsApprovedBy may be absent.
    return val.tenantId === tenantId ? { ...val, variantsApprovedBy: val.variantsApprovedBy ?? null } : null;
  }

  // Pointer record: at most one holder per campaign+version. Claimed and
  // released atomically via ETag compare-and-put.
  private pointerPath(tenantId: string, campaignId: string, campaignVersion: number): string {
    return `${tenantRoot(tenantId)}/experimentActive/${safeKey(campaignId)}__${campaignVersion}`;
  }

  async activateExperiment(e: Experiment, approverUid: string): Promise<"activated" | "another_active" | "conflict"> {
    // Step 1: claim the campaign+version pointer. Two racing activations of
    // DIFFERENT drafts cannot both pass this atomic write.
    const claimed = await rtdbCasPut<string>(
      this.pointerPath(e.tenantId, e.campaignId, e.campaignVersion),
      (current) => current === null || current === e.experimentId,
      e.experimentId
    );
    if (!claimed) return "another_active";
    // Step 2: transition the experiment itself, draft -> active, atomically.
    const next: Experiment = { ...e, status: "active", variantsApprovedBy: approverUid };
    const transitioned = await rtdbCasPut<Experiment>(
      `${tenantRoot(e.tenantId)}/experiments/${safeKey(e.experimentId)}`,
      (current) => current !== null && current.tenantId === e.tenantId && current.status === "draft",
      next
    );
    if (!transitioned) {
      // Release the pointer only if we still hold it.
      await rtdbCasPut<string | null>(
        this.pointerPath(e.tenantId, e.campaignId, e.campaignVersion),
        (current) => current === e.experimentId,
        null
      ).catch(() => {});
      return "conflict";
    }
    return "activated";
  }

  async endExperiment(e: Experiment): Promise<boolean> {
    const ended: Experiment = { ...e, status: "ended" };
    const transitioned = await rtdbCasPut<Experiment>(
      `${tenantRoot(e.tenantId)}/experiments/${safeKey(e.experimentId)}`,
      (current) => current !== null && current.tenantId === e.tenantId && current.status === "active",
      ended
    );
    if (!transitioned) return false;
    await rtdbCasPut<string | null>(
      this.pointerPath(e.tenantId, e.campaignId, e.campaignVersion),
      (current) => current === e.experimentId,
      null
    ).catch(() => {});
    return true;
  }

  async getActiveExperiment(tenantId: string, campaignId: string, campaignVersion: number): Promise<Experiment | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/experiments`).get();
    if (!snap.exists()) return null;
    return (
      Object.values(snap.val() as Record<string, Experiment>).find(
        (e) => e.tenantId === tenantId && e.campaignId === campaignId && e.campaignVersion === campaignVersion && e.status === "active"
      ) ?? null
    );
  }

  async listExperiments(tenantId: string, campaignId: string): Promise<Experiment[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/experiments`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, Experiment>).filter((e) => e.tenantId === tenantId && e.campaignId === campaignId);
  }
}
