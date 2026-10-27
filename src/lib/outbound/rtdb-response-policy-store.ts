// RTDB-backed ResponsePolicyStore. Versioned policies are immutable
// records; listing filters tenant-side like every other store.

import { tenantRoot } from "./rtdb-store.ts";
import type { ResponsePolicy, ResponsePolicyStore } from "./auto-responses.ts";

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

export class RtdbResponsePolicyStore implements ResponsePolicyStore {
  async save(policy: ResponsePolicy): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(policy.tenantId)}/responsePolicies/${safeKey(policy.policyId)}`).set(policy);
  }
  async list(tenantId: string): Promise<ResponsePolicy[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/responsePolicies`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, ResponsePolicy>)
      .filter((p) => p && p.tenantId === tenantId)
      .sort((a, b) => b.version - a.version);
  }
}
