// RTDB-backed stores for CSV import: accounts (indexed by domain), source
// evidence, and a contact email index. Emails are indexed by sha256, never
// used as RTDB path keys.

import { createHash } from "node:crypto";
import type { Account, SourceEvidence } from "./types.ts";
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

function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

// Domains contain dots, which are illegal in RTDB path keys: index them by
// sha256 like emails (deterministic point lookups, no readable PII in keys).
function domainKey(domain: string): string {
  return createHash("sha256").update(domain.trim().toLowerCase(), "utf8").digest("hex");
}

export class RtdbAccountStore {
  async getAccount(tenantId: string, accountId: string): Promise<Account | null> {
    const database = await db();
    const acc = await database.ref(`${tenantRoot(tenantId)}/accounts/${safeKey(accountId)}`).get();
    if (!acc.exists()) return null;
    const val = acc.val() as Account;
    return val.tenantId === tenantId ? val : null;
  }

  async getAssignment(tenantId: string, domain: string): Promise<string | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/domainAssignments/${domainKey(domain)}`).get();
    if (!snap.exists()) return null;
    return snap.val() as string;
  }

  async saveAssignment(tenantId: string, domain: string, accountId: string): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(tenantId)}/domainAssignments/${domainKey(domain)}`).set(accountId);
  }

  async findByDomain(tenantId: string, domain: string): Promise<Account | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/accountsByDomain/${domainKey(domain)}`).get();
    if (!snap.exists()) return null;
    const accountId = snap.val() as string;
    const acc = await database.ref(`${tenantRoot(tenantId)}/accounts/${safeKey(accountId)}`).get();
    if (!acc.exists()) return null;
    const val = acc.val() as Account;
    return val.tenantId === tenantId ? val : null;
  }

  async saveAccount(a: Account): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(a.tenantId)}/accounts/${safeKey(a.accountId)}`).set(a);
    await database.ref(`${tenantRoot(a.tenantId)}/accountsByDomain/${domainKey(a.domain)}`).set(a.accountId);
  }
}

export class RtdbEvidenceStore {
  async saveEvidence(e: SourceEvidence): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(e.tenantId)}/evidence/${safeKey(e.evidenceId)}`).set(e);
  }

  async listEvidence(tenantId: string): Promise<SourceEvidence[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/evidence`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, SourceEvidence>).filter((e) => e && e.tenantId === tenantId);
  }

  async deleteEvidence(tenantId: string, evidenceId: string): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(tenantId)}/evidence/${safeKey(evidenceId)}`).remove();
  }
}

// Memory counterpart for tests and dry-run composition.
export class MemoryEvidenceStore {
  items = new Map<string, SourceEvidence>();
  async saveEvidence(e: SourceEvidence): Promise<void> {
    this.items.set(`${e.tenantId}:${e.evidenceId}`, e);
  }
  async listEvidence(tenantId: string): Promise<SourceEvidence[]> {
    return [...this.items.values()].filter((e) => e.tenantId === tenantId);
  }
  async deleteEvidence(tenantId: string, evidenceId: string): Promise<void> {
    this.items.delete(`${tenantId}:${evidenceId}`);
  }
}

export function contactEmailIndexKey(email: string): string {
  return emailKey(email);
}
