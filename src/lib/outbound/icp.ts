// Versioned Ideal Customer Profile (PRD F01): sectors, roles, size, region,
// exclusions and approved product claims. Every change is a NEW version;
// confirmed versions are immutable records. A version becomes active only
// through explicit human confirmation - URL-derived proposals are drafts
// like any other and are never approved automatically.
//
// SINGLE ACTIVATION: the tenant-scoped current pointer (IcpStore
// getCurrentId/casSetCurrent) is the source of truth for which version is
// active; a confirm wins only by CAS-ing the pointer from the value it
// read. Two concurrent confirms of DIFFERENT drafts cannot both win the
// pointer - the loser is told to retry and its just-confirmed record is
// superseded.
//
// FAIL CLOSED: "current" resolves ONLY through the pointer, and only to a
// record that carries activatedAt (written after the pointer was won). A
// confirmed record without activatedAt was never successfully activated -
// including the initial-activation crash window (record CAS landed, pointer
// CAS never did) - and is never exposed as current. currentIcp() survives
// below as a deterministic characterization helper for tests ONLY; no
// runtime path uses it to decide the active ICP.
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
  // Set only AFTER the tenant pointer was won. confirmed + activatedAt =
  // successfully activated at some point; confirmed without it = never
  // activated (crash orphan or pointer-race loser), never usable as a
  // scoring target.
  activatedAt: ISODate | null;
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
    activatedAt: null,
    createdAt: now,
    createdBy: input.actor,
  };
}

export interface IcpStore {
  save(version: IcpVersion): Promise<void>;
  get(tenantId: string, icpVersionId: string): Promise<IcpVersion | null>;
  list(tenantId: string): Promise<IcpVersion[]>;
  // Tenant-scoped current pointer: the single-activation mechanism.
  getCurrentId(tenantId: string): Promise<string | null>;
  // Sets the pointer only if it still holds expectedCurrentId (null = unset).
  casSetCurrent(tenantId: string, expectedCurrentId: string | null, nextCurrentId: string): Promise<boolean>;
  // Optional per-record CAS for the draft -> confirmed transition; stores
  // without it fall back to a plain write (single-process use only).
  casConfirm?(expectedDraft: IcpVersion, confirmed: IcpVersion): Promise<boolean>;
}

// READ FALLBACK ONLY: highest-version confirmed version wins; ties break on
// createdAt. Deterministic selection is not single activation - use the
// tenant pointer where available; this resolves reads when none exists.
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

export type ConfirmOutcome =
  | { ok: true; confirmed: IcpVersion; superseded: IcpVersion[] }
  | { ok: false; reason: "not_found" | "not_draft" | "record_race" | "pointer_race" };

// The full confirmation sequence against a store, with single activation:
//   1. per-record CAS draft -> confirmed (crash here: unpointed confirmed
//      record, reads still follow the old pointer);
//   2. tenant pointer CAS expected -> new (crash here: same as 1; losing a
//      race here supersedes our just-confirmed record so it cannot linger
//      as apparently-active);
//   3. supersede previously confirmed records (crash here: stale confirmed
//      records remain, but the pointer keeps reads single-active).
// Known residual limit: step 1 runs before the pointer is won, so a process
// can confirm-then-lose and briefly hold a confirmed-but-never-active
// record until step 2's cleanup lands; reads via the pointer are never
// affected, but list views can transiently show it.
export async function confirmIcp(
  store: IcpStore,
  tenantId: string,
  icpVersionId: string,
  actor: string,
  now: Date,
): Promise<ConfirmOutcome> {
  const versions = await store.list(tenantId);
  const target = versions.find((v) => v.icpVersionId === icpVersionId);
  if (!target) return { ok: false, reason: "not_found" };
  let plan;
  try {
    plan = planConfirmation(versions, tenantId, icpVersionId, actor, now);
  } catch {
    return { ok: false, reason: "not_draft" };
  }
  const pointerBefore = await store.getCurrentId(tenantId);
  let recordWon: boolean;
  if (typeof store.casConfirm === "function") {
    recordWon = await store.casConfirm(target, plan.confirmed);
  } else {
    await store.save(plan.confirmed);
    recordWon = true;
  }
  if (!recordWon) return { ok: false, reason: "record_race" };
  const activated = await store.casSetCurrent(tenantId, pointerBefore, icpVersionId);
  if (!activated) {
    await store.save({ ...plan.confirmed, status: "superseded" });
    return { ok: false, reason: "pointer_race" };
  }
  // Pointer won: record the successful activation on the record itself.
  // Crash between the pointer CAS and this write leaves the pointer aimed
  // at a record without activatedAt; resolveCurrentIcp fails closed on
  // that until a later write heals it.
  const activatedRecord: IcpVersion = { ...plan.confirmed, activatedAt: now.toISOString() };
  await store.save(activatedRecord);
  for (const sup of plan.superseded) {
    await store.save(sup);
  }
  return { ok: true, confirmed: activatedRecord, superseded: plan.superseded };
}

// The ONLY runtime resolution of the active ICP: pointer-aimed record,
// requiring status confirmed AND activatedAt set. Anything else (no
// pointer, dangling pointer, unactivated record) resolves to null.
export async function resolveCurrentIcp(store: IcpStore, tenantId: string): Promise<IcpVersion | null> {
  const pointerId = await store.getCurrentId(tenantId);
  if (!pointerId) return null;
  const record = await store.get(tenantId, pointerId);
  if (!record || record.status !== "confirmed" || record.activatedAt === null) return null;
  return record;
}

// Scoring-target acceptance: an explicitly referenced ICP version must have
// been successfully activated at some point (activatedAt set), whether it
// is current now or superseded history. Confirmed-but-never-activated is
// rejected.
export function icpUsableAsTarget(icp: IcpVersion | null): icp is IcpVersion {
  return icp !== null && icp.activatedAt !== null && (icp.status === "confirmed" || icp.status === "superseded");
}

// Exclusion policy (PRD F05): an activated ICP's exclusion entries are
// domains or keywords never targeted. Matching is case-insensitive: exact
// contact-email-domain match, exact account-domain match, or a keyword
// contained in either domain. An empty exclusion list excludes nothing.
export function isExcludedByIcp(
  exclusions: string[],
  input: { email: string; accountDomain?: string | null },
): { excluded: boolean; matched: string | null } {
  const emailDomain = (input.email.split("@")[1] ?? "").toLowerCase();
  const accountDomain = (input.accountDomain ?? "").toLowerCase();
  for (const raw of exclusions) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (emailDomain === entry || accountDomain === entry || (emailDomain.includes(entry) || (accountDomain.length > 0 && accountDomain.includes(entry)))) {
      return { excluded: true, matched: raw };
    }
  }
  return { excluded: false, matched: null };
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
  current = new Map<string, string>();
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
  async getCurrentId(tenantId: string): Promise<string | null> {
    return this.current.get(tenantId) ?? null;
  }
  async casSetCurrent(tenantId: string, expectedCurrentId: string | null, nextCurrentId: string): Promise<boolean> {
    if ((this.current.get(tenantId) ?? null) !== expectedCurrentId) return false;
    this.current.set(tenantId, nextCurrentId);
    return true;
  }
}
