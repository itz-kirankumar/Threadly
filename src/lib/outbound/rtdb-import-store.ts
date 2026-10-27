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

export class RtdbAccountStore {
  async findByDomain(tenantId: string, domain: string): Promise<Account | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/accountsByDomain/${safeKey(domain)}`).get();
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
    await database.ref(`${tenantRoot(a.tenantId)}/accountsByDomain/${safeKey(a.domain)}`).set(a.accountId);
  }
}

export class RtdbEvidenceStore {
  async saveEvidence(e: SourceEvidence): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(e.tenantId)}/evidence/${safeKey(e.evidenceId)}`).set(e);
  }
}

export function contactEmailIndexKey(email: string): string {
  return emailKey(email);
}
