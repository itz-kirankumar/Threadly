// Pre-effect durable operation intents (PRD section 07 audit trail, hardening
// of the booking commit path). The intent is written AFTER the atomic claim
// and BEFORE any provider call, so a crash or failure mid-commit leaves a
// durable record of what was attempted, on what, for whom. This is not a
// transactional outbox: the intent write and the claim are two writes, and
// provider effects live outside RTDB. The reconciler closes the remaining
// windows (crash between claim and intent write; intent never resolved).

import type { ISODate } from "./types.ts";
import type { BookingLinkStore } from "./booking-flow.ts";

export type OperationIntentState = "intent" | "completed" | "quarantined";

export interface OperationIntent {
  tenantId: string;
  opId: string;
  kind: "booking.commit";
  state: OperationIntentState;
  // References only: tokenHash (never the token), startISO, contactId,
  // organizerSenderId, policyId. No provider payloads.
  payload: Record<string, string | null>;
  createdAt: ISODate;
  resolvedAt: ISODate | null;
  error: string | null;
}

export interface OperationIntentStore {
  // Create-or-identical: re-putting the same opId with identical content is
  // a no-op; differing content under an existing opId throws (never
  // overwrites), mirroring the audit store's tamper control.
  putIntent(intent: OperationIntent): Promise<void>;
  // Atomic state transition; succeeds only when the current state matches
  // `from`. Returns false on a state conflict.
  transitionIntent(tenantId: string, opId: string, from: OperationIntentState, to: "completed" | "quarantined", error?: string): Promise<boolean>;
  getIntent(tenantId: string, opId: string): Promise<OperationIntent | null>;
  listIntents(tenantId: string, state?: OperationIntentState): Promise<OperationIntent[]>;
}

export function sameIntent(a: OperationIntent, b: OperationIntent): boolean {
  return a.tenantId === b.tenantId && a.opId === b.opId && a.kind === b.kind && a.state === b.state
    && (a.resolvedAt ?? null) === (b.resolvedAt ?? null) && (a.error ?? null) === (b.error ?? null)
    && a.createdAt === b.createdAt && JSON.stringify(a.payload) === JSON.stringify(b.payload);
}

export class MemoryOperationIntentStore implements OperationIntentStore {
  intents: OperationIntent[] = [];
  async putIntent(intent: OperationIntent): Promise<void> {
    const existing = this.intents.find((i) => i.opId === intent.opId && i.tenantId === intent.tenantId);
    if (existing) {
      if (sameIntent(existing, intent)) return;
      throw new Error(`operation_intent_conflict: ${intent.opId}`);
    }
    this.intents.push(intent);
  }
  async transitionIntent(tenantId: string, opId: string, from: OperationIntentState, to: "completed" | "quarantined", error?: string): Promise<boolean> {
    const existing = this.intents.find((i) => i.opId === opId && i.tenantId === tenantId);
    if (!existing || existing.state !== from) return false;
    existing.state = to;
    existing.resolvedAt = new Date().toISOString();
    existing.error = error ?? null;
    return true;
  }
  async getIntent(tenantId: string, opId: string): Promise<OperationIntent | null> {
    return this.intents.find((i) => i.opId === opId && i.tenantId === tenantId) ?? null;
  }
  async listIntents(tenantId: string, state?: OperationIntentState): Promise<OperationIntent[]> {
    return this.intents.filter((i) => i.tenantId === tenantId && (!state || i.state === state));
  }
}

// Lazy recovery sweep, same pattern as the audit outbox recovery: runs on
// operator activity, bounded, never throws into the request path. Two
// windows are closed:
//   1. claim without completion older than staleMs (crash between claim and
//      intent write, or a stranded in-flight commit): link quarantined via
//      markClaimUnknown - never retried automatically.
//   2. intent still in state "intent" older than staleMs (crash after intent
//      write, before resolution): intent quarantined.
// Links stuck in "claiming" WITHOUT a claimedAt timestamp predate the
// claimedAt stamp. Every new claim carries one, so a missing stamp proves the
// claim predates this reconciler's deployment and cannot be in flight: it is
// quarantined on sight as legacy, with a distinct note.
export async function reconcileBookingIntents(
  stores: { links: BookingLinkStore; intents: OperationIntentStore },
  tenantId: string,
  opts: { now: Date; staleMs?: number; limit?: number }
): Promise<{ quarantinedLinks: number; quarantinedIntents: number }> {
  const staleMs = opts.staleMs ?? 10 * 60 * 1000;
  const limit = opts.limit ?? 10;
  const cutoff = opts.now.getTime() - staleMs;
  let quarantinedLinks = 0;
  let quarantinedIntents = 0;
  const links = await stores.links.listLinks(tenantId);
  const staleClaims = links
    .filter((l) => l.claimState === "claiming" && (l.claimedAt == null || Date.parse(l.claimedAt) < cutoff))
    .slice(0, limit);
  for (const link of staleClaims) {
    await stores.links.markClaimUnknown(
      link,
      link.claimedAt == null
        ? "reconciler: legacy claim predates claimedAt tracking; cannot be in flight, quarantined"
        : "reconciler: claim exceeded stale threshold without completion"
    );
    quarantinedLinks += 1;
  }
  const staleIntents = (await stores.intents.listIntents(tenantId, "intent"))
    .filter((i) => Date.parse(i.createdAt) < cutoff)
    .slice(0, limit);
  for (const intent of staleIntents) {
    const ok = await stores.intents.transitionIntent(tenantId, intent.opId, "intent", "quarantined", "reconciler: intent never resolved");
    if (ok) quarantinedIntents += 1;
  }
  return { quarantinedLinks, quarantinedIntents };
}
