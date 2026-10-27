// Evidence-based fit score (PRD F04): weighted criteria scored ONLY from
// dated SourceEvidence. Every reason links to its evidence record and the
// result carries the score version. A criterion without dated supporting
// evidence is UNKNOWN - excluded from numerator and denominator, never
// treated as zero and never invented. Freshness decays contribution with a
// configurable half-life; the denominator uses raw weights so stale
// evidence lowers the score instead of renormalizing away.
//
// This module scores; it does not gate. Wiring a minimum score into
// planning or dispatch is a separate owner-approved step.

import { createHash } from "node:crypto";
import type { Account, Contact, CreationMeta, ISODate, SourceEvidence } from "./types.ts";

export const FIT_CRITERIA = ["role", "region", "size", "sector"] as const;
export type FitCriterion = (typeof FIT_CRITERIA)[number];

// Maps each criterion to the record field it scores and the SourceEvidence
// `field` tag that can support it.
const CRITERION_FIELD: Record<FitCriterion, string> = {
  role: "title",
  region: "region",
  size: "employeeBand",
  sector: "sector",
};

export interface FitScoreWeights {
  role: number;
  region: number;
  size: number;
  sector: number;
}

export interface FitScoreConfig {
  version: string; // recorded on every computed result
  weights: FitScoreWeights;
  freshnessHalfLifeDays: number;
}

export const DEFAULT_FIT_SCORE_CONFIG: FitScoreConfig = {
  version: "f04.v1",
  weights: { role: 4, sector: 3, region: 2, size: 2 },
  freshnessHalfLifeDays: 90,
};

export interface TargetProfile {
  roles?: string[]; // contact.title keywords, case-insensitive substring
  regions?: string[]; // account.region exact (normalized)
  employeeBands?: string[]; // account.employeeBand exact (normalized)
  sectors?: string[]; // account.sector exact (normalized)
}

export type FitReasonState = "matched" | "mismatched" | "unknown";

export interface FitScoreReason {
  criterion: FitCriterion;
  state: FitReasonState;
  weight: number;
  evidenceId: string | null;
  evidenceObservedAt: ISODate | null;
  evidenceAgeDays: number | null;
  freshnessFactor: number | null;
  contribution: number | null; // null when unknown - never a fabricated zero-claim
  detail: string;
}

export interface FitScoreResult extends CreationMeta {
  tenantId: string;
  scoreId: string;
  contactId: string;
  accountId: string;
  scoreVersion: string;
  score: number | null; // 0..1 over KNOWN criteria; null when nothing had dated evidence
  coverage: { known: number; total: number }; // total = criteria the target defines
  reasons: FitScoreReason[];
  computedAt: ISODate;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Newest dated evidence supporting `field` for this contact or its account.
// Evidence without a field tag cannot support a criterion; evidence without
// an observedAt cannot establish freshness and is ignored.
function supportingEvidence(evidence: SourceEvidence[], contact: Contact, field: string): SourceEvidence | null {
  const candidates = evidence.filter(
    (e) =>
      e.field === field &&
      typeof e.observedAt === "string" &&
      e.observedAt.length > 0 &&
      !Number.isNaN(Date.parse(e.observedAt)) &&
      (e.contactId === contact.contactId || (e.accountId !== undefined && e.accountId === contact.accountId)),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  return candidates[0];
}

export function computeFitScore(
  input: {
    contact: Contact;
    account: Account | null;
    evidence: SourceEvidence[];
    target: TargetProfile;
    config?: FitScoreConfig;
    now: Date;
    actor: string;
  },
): FitScoreResult {
  const config = input.config ?? DEFAULT_FIT_SCORE_CONFIG;
  const { contact, account, target, now } = input;
  const reasons: FitScoreReason[] = [];

  const actuals: Record<FitCriterion, string | undefined> = {
    role: contact.title,
    region: account?.region,
    size: account?.employeeBand,
    sector: account?.sector,
  };
  const targets: Record<FitCriterion, string[] | undefined> = {
    role: target.roles,
    region: target.regions,
    size: target.employeeBands,
    sector: target.sectors,
  };
  const matchers: Record<FitCriterion, (actual: string, wanted: string[]) => boolean> = {
    role: (a, w) => w.some((t) => norm(a).includes(norm(t))),
    region: (a, w) => w.map(norm).includes(norm(a)),
    size: (a, w) => w.map(norm).includes(norm(a)),
    sector: (a, w) => w.map(norm).includes(norm(a)),
  };

  for (const criterion of FIT_CRITERIA) {
    const wanted = targets[criterion];
    if (!wanted || wanted.length === 0) continue; // target does not define this criterion
    const weight = config.weights[criterion];
    const field = CRITERION_FIELD[criterion];
    const actual = actuals[criterion];
    const evidence = supportingEvidence(input.evidence, contact, field);

    if (!evidence) {
      reasons.push({
        criterion, state: "unknown", weight,
        evidenceId: null, evidenceObservedAt: null, evidenceAgeDays: null,
        freshnessFactor: null, contribution: null,
        detail: `no dated evidence for ${field}; treated as unknown, not zero`,
      });
      continue;
    }
    const ageDays = Math.max(0, (now.getTime() - Date.parse(evidence.observedAt)) / 86_400_000);
    const factor = round4(Math.pow(0.5, ageDays / config.freshnessHalfLifeDays));

    if (!actual || actual.trim().length === 0) {
      reasons.push({
        criterion, state: "unknown", weight,
        evidenceId: evidence.evidenceId, evidenceObservedAt: evidence.observedAt,
        evidenceAgeDays: round4(ageDays), freshnessFactor: factor, contribution: null,
        detail: `${field} value absent on record; evidence exists but nothing to score`,
      });
      continue;
    }
    const matched = matchers[criterion](actual, wanted);
    reasons.push({
      criterion, state: matched ? "matched" : "mismatched", weight,
      evidenceId: evidence.evidenceId, evidenceObservedAt: evidence.observedAt,
      evidenceAgeDays: round4(ageDays), freshnessFactor: factor,
      contribution: round4(matched ? weight * factor : 0),
      detail: `${field} "${actual}" ${matched ? "matches" : "does not match"} target; evidence ${evidence.sourceName} observed ${evidence.observedAt} (${evidence.uncertainty})`,
    });
  }

  const known = reasons.filter((r) => r.state !== "unknown");
  const denominator = known.reduce((sum, r) => sum + r.weight, 0);
  const numerator = known.reduce((sum, r) => sum + (r.contribution ?? 0), 0);
  const computedAt = now.toISOString();
  const scoreId = "fs_" + createHash("sha256").update(`${contact.tenantId}|${contact.contactId}|${computedAt}|${config.version}`).digest("hex").slice(0, 16);
  return {
    tenantId: contact.tenantId,
    scoreId,
    contactId: contact.contactId,
    accountId: contact.accountId,
    scoreVersion: config.version,
    score: denominator === 0 ? null : round4(numerator / denominator),
    coverage: { known: known.length, total: reasons.length },
    reasons,
    computedAt,
    createdAt: computedAt,
    createdBy: input.actor,
  };
}

export interface FitScoreStore {
  save(result: FitScoreResult): Promise<void>;
  listForContact(tenantId: string, contactId: string): Promise<FitScoreResult[]>;
  latest(tenantId: string, contactId: string): Promise<FitScoreResult | null>;
  list(tenantId: string): Promise<FitScoreResult[]>;
}

export class MemoryFitScoreStore implements FitScoreStore {
  results = new Map<string, FitScoreResult>();
  async save(result: FitScoreResult): Promise<void> {
    this.results.set(`${result.tenantId}:${result.contactId}:${result.scoreId}`, result);
  }
  async listForContact(tenantId: string, contactId: string): Promise<FitScoreResult[]> {
    return [...this.results.values()]
      .filter((r) => r.tenantId === tenantId && r.contactId === contactId)
      .sort((a, b) => b.computedAt.localeCompare(a.computedAt));
  }
  async latest(tenantId: string, contactId: string): Promise<FitScoreResult | null> {
    return (await this.listForContact(tenantId, contactId))[0] ?? null;
  }
  async list(tenantId: string): Promise<FitScoreResult[]> {
    return [...this.results.values()]
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => b.computedAt.localeCompare(a.computedAt));
  }
}
