// RTDB-backed booking policy + link stores. Policies live under the tenant
// root. Links are indexed globally by token hash (the public booking page
// has no tenant context); the stored record carries the tenantId and only
// the sha256 of the token, never the token itself.

import type { BookingLink, BookingPolicy } from "./types.ts";
import { outboundDataRoot, tenantRoot } from "./rtdb-store.ts";
import type { BookingLinkStore, BookingPolicyStore } from "./booking-flow.ts";

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

export class RtdbBookingStore implements BookingPolicyStore, BookingLinkStore {
  async savePolicy(p: BookingPolicy): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(p.tenantId)}/bookingPolicies/${safeKey(p.policyId)}`).set(p);
  }

  async getPolicy(tenantId: string, policyId: string): Promise<BookingPolicy | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/bookingPolicies/${safeKey(policyId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as BookingPolicy;
    return val.tenantId === tenantId ? val : null;
  }

  async listPolicies(tenantId: string): Promise<BookingPolicy[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/bookingPolicies`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, BookingPolicy>).filter((p) => p.tenantId === tenantId);
  }

  async saveLink(l: BookingLink): Promise<void> {
    const database = await db();
    await database.ref(`${outboundDataRoot()}/bookingLinksByToken/${safeKey(l.tokenHash)}`).set(l);
  }

  async getLinkByTokenHash(tokenHash: string): Promise<BookingLink | null> {
    const database = await db();
    const snap = await database.ref(`${outboundDataRoot()}/bookingLinksByToken/${safeKey(tokenHash)}`).get();
    return snap.exists() ? (snap.val() as BookingLink) : null;
  }

  async updateLink(l: BookingLink): Promise<void> {
    await this.saveLink(l);
  }
}
