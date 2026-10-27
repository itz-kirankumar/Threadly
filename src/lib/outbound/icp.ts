// Versioned Ideal Customer Profile (PRD F01): sectors, roles, size, region,
// exclusions and approved product claims. Every change is a NEW version;
// confirmed versions are immutable records. A version becomes active only
// through explicit human confirmation - URL-derived proposals are drafts
// like any other and are never approved automatically. The current ICP is
// the highest-version confirmed version.
//
// This module does not extract from URLs itself (no LLM call; provider
// spend is an owner decision). Callers supply proposed text with provenance
// and the module stores it as an unconfirmed draft.

import { createHash } from "node:crypto";
import type { CreationMeta, ISODate } from "./types.ts";

export type IcpStatus = "draft" | "confirmed" | "superseded";

export interface IcpSource {
  kind: "manual" | "url_derived";
  url?: string; // present when url_derived
}

export interface IcpVersion extends CreationMeta {
  tenantId: string;
  icpVersionId: string;
  version: number; // monotonic per tenant, allocated at draft creation
  status: IcpStatus;
  sectors: string[];
  roles: string[];
  employeeBands: string[];
  regions: string[];
  exclusions: string[]; // domains or keywords never targeted
  approvedClaims: string[]; // product claims personalization may use
  source: IcpSource;
  confirmedAt: ISODate | null;
  confirmedBy: string | null;
}

function cleanList(v: unknown, max = 100): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0))].slice(0, max);
}

export interface IcpDraftInput {
  tenantId: string;
  actor: string;
  now: Date;
  sectors?: unknown;
  roles?: unknown;
  employeeBands?: unknown;
  regions?: unknown;
  exclusions?: unknown;
  approvedClaims?: unknown;
  source: IcpSource;
}

export function createIcpDraft(input: IcpDraftInput, nextVersion: number): IcpVersion {
  const now = input.now.toISOString();
  const icpVersionId = "icp_" + createHash("sha256").update(`${input.tenantId}|${nextVersion}|${now}|${input.actor}`).digest("hex").slice(0, 16);
  return {
    tenantId: input.tenantId,
    icpVersionId,
    version: nextVersion,
    status: "draft", // always draft - confirmation is a separate explicit act
    sectors: cleanList(input.sectors),
    roles: cleanList(input.roles),
    employeeBands: cleanList(input.employeeBands),
    regions: cleanList(input.regions),
    exclusions: cleanList(input.exclusions),
    approvedClaims: cleanList(input.approvedClaims, 50),
    source: input.source.kind === "url_derived" ? { kind: "url_derived", url: input.source.url } : { kind: "manual" },
    confirmedAt: null,
    confirmedBy: null,
    createdAt: now,
    createdBy: input.actor,
  };
}

export interface IcpStore {
  save(version: IcpVersion): Promise<void>;
  get(tenantId: string, icpVersionId: string): Promise<IcpVersion | null>;
  list(tenantId: string): Promise<IcpVersion[]>;
}

// Highest-version confirmed version wins; ties break on createdAt.
export function currentIcp(versions: IcpVersion[]): IcpVersion | null {
  const confirmed = versions.filter((v) => v.status === "confirmed");
  if (confirmed.length === 0) return null;
  confirmed.sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt));
  return confirmed[0];
}

export function nextVersionNumber(versions: IcpVersion[]): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

// Confirm a draft: it becomes the active ICP and every previously confirmed
// version is superseded. Only drafts can be confirmed - confirming again or
// confirming a superseded record is rejected. Returns the records to write
// (confirmed first, then supersessions) so a crash mid-write can leave two
// confirmed versions, which currentIcp still resolves deterministically.
export function planConfirmation(
  versions: IcpVersion[],
  tenantId: string,
  icpVersionId: string,
  actor: string,
  now: Date,
): { confirmed: IcpVersion; superseded: IcpVersion[] } {
  const target = versions.find((v) => v.tenantId === tenantId && v.icpVersionId === icpVersionId);
  if (!target) throw new Error("ICP version not found");
  if (target.status !== "draft") throw new Error(`cannot confirm an ICP version in state ${target.status}`);
  const confirmed: IcpVersion = { ...target, status: "confirmed", confirmedAt: now.toISOString(), confirmedBy: actor };
  const superseded = versions
    .filter((v) => v.tenantId === tenantId && v.status === "confirmed" && v.icpVersionId !== icpVersionId)
    .map((v) => ({ ...v, status: "superseded" as const }));
  return { confirmed, superseded };
}

// Maps a confirmed ICP to the F04 scoring target profile. Exclusions and
// approved claims are not scoring criteria; they gate targeting and
// personalization elsewhere.
export function targetFromIcp(icp: IcpVersion): { roles?: string[]; regions?: string[]; employeeBands?: string[]; sectors?: string[] } {
  const target: { roles?: string[]; regions?: string[]; employeeBands?: string[]; sectors?: string[] } = {};
  if (icp.roles.length > 0) target.roles = icp.roles;
  if (icp.regions.length > 0) target.regions = icp.regions;
  if (icp.employeeBands.length > 0) target.employeeBands = icp.employeeBands;
  if (icp.sectors.length > 0) target.sectors = icp.sectors;
  return target;
}

export class MemoryIcpStore implements IcpStore {
  versions = new Map<string, IcpVersion>();
  async save(version: IcpVersion): Promise<void> {
    this.versions.set(`${version.tenantId}:${version.icpVersionId}`, version);
  }
  async get(tenantId: string, icpVersionId: string): Promise<IcpVersion | null> {
    const v = this.versions.get(`${tenantId}:${icpVersionId}`);
    return v && v.tenantId === tenantId ? v : null;
  }
  async list(tenantId: string): Promise<IcpVersion[]> {
    return [...this.versions.values()]
      .filter((v) => v.tenantId === tenantId)
      .sort((a, b) => b.version - a.version);
  }
}
