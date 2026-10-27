// Licensed discovery sources (PRD F02): a tenant-scoped registry of the
// company/contact APIs whose license permits the intended B2B marketing
// use. Rows sourced from a licensed API may only be committed when the
// source is registered, unrevoked and license-permitting - anything else is
// blocked (fail-closed), exactly like an undeclared CSV source.
//
// This module ships the registry and the provider INTERFACE only. No live
// discovery provider is implemented or called: activating a paid discovery
// API is an owner decision and stays unexercised.

import { createHash } from "node:crypto";
import type { CreationMeta, ISODate } from "./types.ts";

export interface LicensedSource extends CreationMeta {
  tenantId: string;
  sourceId: string;
  sourceName: string; // normalized lowercase unique per tenant
  kind: "licensed_api";
  licensePermitsUse: boolean; // for intendedUse b2b_marketing
  termsUrl: string | null;
  revokedAt: ISODate | null; // revoked sources block new imports, keep history
}

export function registerLicensedSource(input: {
  tenantId: string;
  sourceName: string;
  licensePermitsUse: boolean;
  termsUrl?: string | null;
  actor: string;
  now: Date;
}): LicensedSource {
  const name = input.sourceName.trim().toLowerCase();
  if (!name) throw new Error("sourceName is required");
  const now = input.now.toISOString();
  return {
    tenantId: input.tenantId,
    sourceId: "ls_" + createHash("sha256").update(`${input.tenantId}|${name}`).digest("hex").slice(0, 16),
    sourceName: name,
    kind: "licensed_api",
    licensePermitsUse: input.licensePermitsUse,
    termsUrl: input.termsUrl ?? null,
    revokedAt: null,
    createdAt: now,
    createdBy: input.actor,
  };
}

// Fail-closed gate: the named source must exist, permit the use and be
// unrevoked. Returns the record on success; throws a typed reason otherwise.
export function requireLicensedSource(
  sources: LicensedSource[],
  tenantId: string,
  sourceName: string,
): LicensedSource {
  const name = sourceName.trim().toLowerCase();
  const found = sources.find((s) => s.tenantId === tenantId && s.sourceName === name);
  if (!found) throw new Error(`unlicensed_source: "${name}" is not a registered licensed source`);
  if (found.revokedAt !== null) throw new Error(`unlicensed_source: "${name}" was revoked at ${found.revokedAt}`);
  if (!found.licensePermitsUse) throw new Error(`unlicensed_source: "${name}" license does not permit b2b_marketing use`);
  return found;
}

export interface LicensedSourceStore {
  save(source: LicensedSource): Promise<void>;
  list(tenantId: string): Promise<LicensedSource[]>;
}

export class MemoryLicensedSourceStore implements LicensedSourceStore {
  sources = new Map<string, LicensedSource>();
  async save(source: LicensedSource): Promise<void> {
    this.sources.set(`${source.tenantId}:${source.sourceId}`, source);
  }
  async list(tenantId: string): Promise<LicensedSource[]> {
    return [...this.sources.values()].filter((s) => s.tenantId === tenantId);
  }
}

// Provider interface for future licensed discovery APIs. Implementations
// must return rows in the CSV-import shape so the same evidence, rights and
// reconciliation pipeline applies. NO live implementation exists; a paid
// provider activates only by owner decision.
export interface DiscoveryProvider {
  sourceName: string;
  search(query: { domain?: string; name?: string; limit?: number }): Promise<
    { email: string; fullName: string; title?: string; accountName: string; accountDomain: string }[]
  >;
}
