// Domain and reputation preflight (PRD F13): identity/authentication evidence
// (SPF, DKIM, DMARC) with a checked-at timestamp, before any sender on the
// domain may dispatch. Fail-closed: a missing record, any failed check, or a
// stale check blocks dispatch. This is transport-identity evidence only; it
// makes NO inbox-placement promise.
//
// DKIM honesty: DKIM keys are selector-addressed and cannot be enumerated.
// We probe common selectors and report which one passed; "missing" means no
// COMMON selector resolved, not proof that no DKIM key exists - an operator
// can attest a custom selector out-of-band in a future owner-approved path.

import { createHash } from "node:crypto";
import type { CreationMeta, ISODate } from "./types.ts";

export type PreflightCheck = "pass" | "fail";

export interface DomainPreflight extends CreationMeta {
  tenantId: string;
  domain: string; // lowercase
  spf: PreflightCheck;
  dkim: PreflightCheck;
  dkimSelector: string | null; // which common selector passed, when one did
  dmarc: PreflightCheck;
  dmarcPolicy: string | null; // p= value when a DMARC record exists
  checkedAt: ISODate;
  evidence: string; // compact raw record summary, truncated
}

export const PREFLIGHT_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const DKIM_COMMON_SELECTORS = ["google", "selector1", "selector2", "default", "k1", "s1", "s2", "dkim", "mail"];

export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
}

export class NodeDnsResolver implements DnsResolver {
  async resolveTxt(name: string): Promise<string[][]> {
    const { promises: dns } = await import("node:dns");
    try {
      return await dns.resolveTxt(name);
    } catch {
      return []; // NXDOMAIN/ENOTFOUND/timeout all read as "no record"
    }
  }
}

function flatten(chunks: string[][]): string[] {
  return chunks.map((c) => c.join(""));
}

function truncate(s: string, max = 400): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function checkDomain(
  tenantId: string,
  domain: string,
  resolver: DnsResolver,
  input: { now: Date; actor: string }
): Promise<DomainPreflight> {
  const d = domain.trim().toLowerCase();
  const evidence: string[] = [];

  // SPF: an SPF record that authorizes anything (+all / ?all) is not
  // authentication evidence for a sending domain.
  const spfRecords = flatten(await resolver.resolveTxt(d)).filter((t) => t.startsWith("v=spf1"));
  const spfRecord = spfRecords[0] ?? null;
  const spf: PreflightCheck = spfRecord && !/\+all|\?all/.test(spfRecord) ? "pass" : "fail";
  evidence.push(`spf: ${spfRecord ?? "no v=spf1 record"}`);

  // DMARC: record presence with v=DMARC1. p=none is weak but IS a published
  // policy; the policy value is recorded in evidence either way.
  const dmarcRecords = flatten(await resolver.resolveTxt(`_dmarc.${d}`)).filter((t) => t.startsWith("v=DMARC1"));
  const dmarcRecord = dmarcRecords[0] ?? null;
  const dmarcPolicy = dmarcRecord ? (dmarcRecord.match(/(?:^|;\s*)p=([a-z]+)/)?.[1] ?? null) : null;
  const dmarc: PreflightCheck = dmarcRecord ? "pass" : "fail";
  evidence.push(`dmarc: ${dmarcRecord ?? "no v=DMARC1 record"}`);

  // DKIM: probe common selectors.
  let dkim: PreflightCheck = "fail";
  let dkimSelector: string | null = null;
  for (const selector of DKIM_COMMON_SELECTORS) {
    const records = flatten(await resolver.resolveTxt(`${selector}._domainkey.${d}`));
    if (records.some((t) => t.includes("v=DKIM1") || t.includes("k=rsa") || t.includes("k=ed25519"))) {
      dkim = "pass";
      dkimSelector = selector;
      break;
    }
  }
  evidence.push(dkimSelector ? `dkim: key found at selector ${dkimSelector}` : "dkim: no key on common selectors");

  return {
    tenantId,
    domain: d,
    spf,
    dkim,
    dkimSelector,
    dmarc,
    dmarcPolicy,
    checkedAt: input.now.toISOString(),
    evidence: truncate(evidence.join(" | ")),
    createdAt: input.now.toISOString(),
    createdBy: input.actor,
  };
}

export type PreflightState = "pass" | "missing" | "failed" | "stale";

// The dispatch gate. Unknown (no record) and stale both block; the state is
// reported with which checks failed so the operator sees what to fix.
export function evaluatePreflight(
  record: DomainPreflight | null,
  now: Date,
  staleMs = PREFLIGHT_STALE_MS
): { state: PreflightState; failedChecks: string[] } {
  if (!record) return { state: "missing", failedChecks: [] };
  if (now.getTime() - Date.parse(record.checkedAt) > staleMs) return { state: "stale", failedChecks: [] };
  const failedChecks: string[] = [];
  if (record.spf !== "pass") failedChecks.push("spf");
  if (record.dkim !== "pass") failedChecks.push("dkim");
  if (record.dmarc !== "pass") failedChecks.push("dmarc");
  return { state: failedChecks.length ? "failed" : "pass", failedChecks };
}

export function domainKey(domain: string): string {
  return createHash("sha256").update(domain.trim().toLowerCase(), "utf8").digest("hex");
}

export interface PreflightStore {
  save(record: DomainPreflight): Promise<void>;
  get(tenantId: string, domain: string): Promise<DomainPreflight | null>;
  list(tenantId: string): Promise<DomainPreflight[]>;
}

export class MemoryPreflightStore implements PreflightStore {
  items = new Map<string, DomainPreflight>();
  async save(record: DomainPreflight): Promise<void> {
    this.items.set(`${record.tenantId}:${domainKey(record.domain)}`, record);
  }
  async get(tenantId: string, domain: string): Promise<DomainPreflight | null> {
    return this.items.get(`${tenantId}:${domainKey(domain)}`) ?? null;
  }
  async list(tenantId: string): Promise<DomainPreflight[]> {
    return [...this.items.values()].filter((r) => r.tenantId === tenantId);
  }
}
