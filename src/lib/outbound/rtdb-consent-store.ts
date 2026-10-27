// RTDB-backed consent trace and token storage. OAuth tokens are stored ONLY
// as AES-256-GCM ciphertext under senderTokens/, separate from the sender
// record, and are never returned by any list/read route.

import type { ConsentTrace } from "./types.ts";
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

export interface StoredSenderTokens {
  ciphertext: string; // encryptSecret(JSON.stringify(ProviderTokens))
  updatedAt: string;
}

export class RtdbConsentStore {
  async saveConsentTrace(trace: ConsentTrace): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(trace.tenantId)}/consentTraces/${safeKey(trace.consentTraceId)}`).set(trace);
  }

  async getConsentTrace(tenantId: string, consentTraceId: string): Promise<ConsentTrace | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/consentTraces/${safeKey(consentTraceId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as ConsentTrace;
    return val.tenantId === tenantId ? val : null;
  }

  async saveSenderTokens(tenantId: string, senderId: string, ciphertext: string): Promise<void> {
    const database = await db();
    const record: StoredSenderTokens = { ciphertext, updatedAt: new Date().toISOString() };
    await database.ref(`${tenantRoot(tenantId)}/senderTokens/${safeKey(senderId)}`).set(record);
  }

  async getSenderTokens(tenantId: string, senderId: string): Promise<StoredSenderTokens | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/senderTokens/${safeKey(senderId)}`).get();
    if (!snap.exists()) return null;
    return snap.val() as StoredSenderTokens;
  }

  async deleteSenderTokens(tenantId: string, senderId: string): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(tenantId)}/senderTokens/${safeKey(senderId)}`).remove();
  }
}
