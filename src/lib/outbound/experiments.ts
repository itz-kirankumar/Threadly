// F10: stable experiment assignment and holdouts. Assignment is a sha256
// bucket over tenant+contact+experiment, so it is deterministic: a contact
// never crosses variants and re-planning never reassigns. Holdout contacts
// are skipped at planning with an explicit reason. An experiment can only be
// created active when every variant is present and variantsApprovedBy names
// an approver; each variant's templates are reviewed exactly like the base
// campaign templates.

import { createHash } from "node:crypto";
import type { Experiment } from "./types.ts";

export interface ExperimentStore {
  saveExperiment(e: Experiment): Promise<void>;
  getActiveExperiment(tenantId: string, campaignId: string, campaignVersion: number): Promise<Experiment | null>;
  listExperiments(tenantId: string, campaignId: string): Promise<Experiment[]>;
}

export class MemoryExperimentStore implements ExperimentStore {
  experiments = new Map<string, Experiment>();

  async saveExperiment(e: Experiment): Promise<void> {
    this.experiments.set(`${e.tenantId}:${e.experimentId}`, e);
  }
  async getActiveExperiment(tenantId: string, campaignId: string, campaignVersion: number): Promise<Experiment | null> {
    return (
      [...this.experiments.values()].find(
        (e) => e.tenantId === tenantId && e.campaignId === campaignId && e.campaignVersion === campaignVersion && e.status === "active"
      ) ?? null
    );
  }
  async listExperiments(tenantId: string, campaignId: string): Promise<Experiment[]> {
    return [...this.experiments.values()].filter((e) => e.tenantId === tenantId && e.campaignId === campaignId);
  }
}

export function assignBucket(tenantId: string, contactId: string, experimentId: string): number {
  const hash = createHash("sha256").update(`${tenantId}:${contactId}:${experimentId}`, "utf8").digest();
  return hash.readUInt32BE(0) % 100;
}

export type Assignment = { kind: "holdout" } | { kind: "variant"; key: string };

export function decideAssignment(experiment: Experiment, contactId: string): Assignment {
  const bucket = assignBucket(experiment.tenantId, contactId, experiment.experimentId);
  if (bucket < experiment.holdoutPercent) return { kind: "holdout" };
  const slot = Math.floor(((bucket - experiment.holdoutPercent) / (100 - experiment.holdoutPercent)) * experiment.variants.length);
  return { kind: "variant", key: experiment.variants[Math.min(slot, experiment.variants.length - 1)].key };
}

export function validateExperiment(e: Experiment): string[] {
  const errors: string[] = [];
  if (!e.variants.length) errors.push("no_variants");
  if (new Set(e.variants.map((v) => v.key)).size !== e.variants.length) errors.push("duplicate_variant_keys");
  for (const v of e.variants) if (!v.templates.length) errors.push(`variant_without_templates:${v.key}`);
  if (e.holdoutPercent < 0 || e.holdoutPercent > 100 || !Number.isInteger(e.holdoutPercent)) errors.push("invalid_holdout_percent");
  if (e.holdoutPercent === 100 && e.variants.length > 0) errors.push("holdout_100_with_variants");
  if (e.status === "active" && !e.variantsApprovedBy) errors.push("variants_not_approved");
  return errors;
}

// Samples with explicit uncertainty: small samples are labeled, never
// presented as measured performance.
export function experimentSummary(
  experiment: Experiment,
  counts: { variant: Record<string, number>; holdout: number }
): { variant: Record<string, number>; holdout: number; totalSample: number; smallSample: boolean } {
  const totalSample = Object.values(counts.variant).reduce((a, b) => a + b, 0) + counts.holdout;
  return { variant: counts.variant, holdout: counts.holdout, totalSample, smallSample: totalSample < 100 };
}
