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

  // Atomic draft -> active transition via ETag compare-and-put: a concurrent
  // activation or edit of the same experiment loses the race and returns
  // false instead of overwriting.
  async activateExperiment(e: Experiment, approverUid: string): Promise<boolean> {
    const next: Experiment = { ...e, status: "active", variantsApprovedBy: approverUid };
    return rtdbCasPut<Experiment>(
      `${tenantRoot(e.tenantId)}/experiments/${safeKey(e.experimentId)}`,
      (current) => current !== null && current.tenantId === e.tenantId && current.status === "draft",
      next
    );
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
