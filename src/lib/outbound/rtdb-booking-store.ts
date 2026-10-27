// RTDB-backed booking policy + link stores. Policies live under the tenant
// root. Links are indexed globally by token hash (the public booking page
// has no tenant context); the stored record carries the tenantId and only
// the sha256 of the token, never the token itself.

import type { BookingLink, BookingPolicy } from "./types.ts";
import { outboundDataRoot, rtdbCasPut, tenantRoot } from "./rtdb-store.ts";
import type { BookingLinkStore, BookingPolicyStore } from "./booking-flow.ts";
import type { OperationIntent, OperationIntentState, OperationIntentStore } from "./operation-intents.ts";
import { sameIntent } from "./operation-intents.ts";

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

// RTDB drops null fields on write: a fresh link reads back with usedAt and
// claimState ABSENT (undefined), so compare loosely against null. Exported
// for the regression test: the live claim bug this fixes passed every
// memory-store test because the in-memory store preserved explicit nulls.
export function linkClaimable(current: BookingLink | null): boolean {
  return !!current && current.usedAt == null && current.claimState == null;
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
    if (!snap.exists()) return null;
    const val = snap.val() as BookingLink;
    // RTDB drops null fields on write; normalize absent nullable fields back
    // to null so downstream writes never carry undefined into set().
    return { ...val, conversationId: val.conversationId ?? null, meetingId: val.meetingId ?? null, claimState: val.claimState ?? null, claimError: val.claimError ?? null, claimedAt: val.claimedAt ?? null };
  }

  async updateLink(l: BookingLink): Promise<void> {
    await this.saveLink(l);
  }

  async claimLink(l: BookingLink): Promise<boolean> {
    const claimed: BookingLink = { ...l, claimState: "claiming", claimedAt: new Date().toISOString() };
    return rtdbCasPut<BookingLink>(
      `${outboundDataRoot()}/bookingLinksByToken/${safeKey(l.tokenHash)}`,
      linkClaimable,
      claimed
    );
  }

  async releaseLinkClaim(l: BookingLink): Promise<void> {
    await this.saveLink({ ...l, claimState: null, claimedAt: null });
  }

  async markClaimUnknown(l: BookingLink, claimError?: string): Promise<void> {
    await this.saveLink({ ...l, claimState: "claim_unknown", claimError: claimError ?? null });
  }

  // Reconciliation surface: every link for the tenant, newest state only.
  // Callers must strip tokenHash before exposing records.
  async listLinks(tenantId: string): Promise<BookingLink[]> {
    const database = await db();
    const snap = await database.ref(`${outboundDataRoot()}/bookingLinksByToken`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, BookingLink>).filter((l) => l.tenantId === tenantId);
  }
}

// Operation intents live under the tenant root (they are operator-facing
// recovery state, unlike links which are indexed globally by token hash).
export class RtdbOperationIntentStore implements OperationIntentStore {
  private path(tenantId: string, opId: string): string {
    return `${tenantRoot(tenantId)}/operationIntents/${safeKey(opId)}`;
  }

  async putIntent(intent: OperationIntent): Promise<void> {
    const wrote = await rtdbCasPut<OperationIntent>(
      this.path(intent.tenantId, intent.opId),
      (current) => current === null || sameIntent(current, intent),
      intent
    );
    if (!wrote) throw new Error(`operation_intent_conflict: ${intent.opId}`);
  }

  async transitionIntent(tenantId: string, opId: string, from: OperationIntentState, to: "completed" | "quarantined", error?: string): Promise<boolean> {
    const next = (current: OperationIntent): OperationIntent => ({
      ...current,
      state: to,
      resolvedAt: new Date().toISOString(),
      error: error ?? null,
    });
    // check-then-CAS: the write only lands when the current state matches.
    // The read-modify-write is atomic via the ETag compare-and-put retry loop.
    const path = this.path(tenantId, opId);
    let decided: OperationIntent | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.getIntent(tenantId, opId);
      if (!current || current.state !== from) return false;
      decided = next(current);
      const wrote = await rtdbCasPut<OperationIntent>(path, (c) => c !== null && c.state === from, decided);
      if (wrote) return true;
      // a real conflict means state changed concurrently: re-evaluate
    }
    return false;
  }

  async getIntent(tenantId: string, opId: string): Promise<OperationIntent | null> {
    const database = await db();
    const snap = await database.ref(this.path(tenantId, opId)).get();
    if (!snap.exists()) return null;
    const val = snap.val() as OperationIntent;
    return val.tenantId === tenantId ? { ...val, resolvedAt: val.resolvedAt ?? null, error: val.error ?? null } : null;
  }

  async listIntents(tenantId: string, state?: OperationIntentState): Promise<OperationIntent[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/operationIntents`).get();
    if (!snap.exists()) return [];
    return (Object.values(snap.val() as Record<string, OperationIntent>) as OperationIntent[])
      .filter((i) => i.tenantId === tenantId && (!state || i.state === state))
      .map((i) => ({ ...i, resolvedAt: i.resolvedAt ?? null, error: i.error ?? null }));
  }
}
