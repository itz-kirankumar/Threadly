// Append-only audit trail (PRD section 07). One event per actor action with
// tenant, actor, action, target, outcome and time. The store exposes append
// and list ONLY - no update or delete methods exist, so tampering requires
// direct database access outside this module.

import type { ISODate } from "./types.ts";

// Thrown when a keyed write finds an existing event with the SAME eventId but
// DIFFERENT content. That is tampering or an id-reuse bug: the existing record
// is never overwritten and the failure is always loud.
export class AuditConflictError extends Error {
  constructor(eventId: string) {
    super(`audit_event_conflict: ${eventId} already exists with different content`);
    this.name = "AuditConflictError";
  }
}

// Field-exact comparison with null/undefined coalescing on nullable fields:
// RTDB drops null fields on write, so a read-back record may LACK a key that
// the in-memory event holds as null. Content equality, not reference or JSON
// identity.
export function sameAuditEvent(a: AuditEvent, b: AuditEvent): boolean {
  return a.tenantId === b.tenantId
    && a.eventId === b.eventId
    && a.actor === b.actor
    && a.action === b.action
    && a.target === b.target
    && a.outcome === b.outcome
    && (a.detail ?? null) === (b.detail ?? null)
    && a.at === b.at;
}

export interface AuditEvent {
  tenantId: string;
  eventId: string;
  actor: string; // user id or system actor
  action: string; // e.g. sender.consent_completed, booking.committed
  target: string; // e.g. sender:snd_1, meeting:mtg_1
  outcome: "success" | "denied" | "error";
  detail: string | null;
  at: ISODate;
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  list(tenantId: string, limit?: number): Promise<AuditEvent[]>;
  // Degraded-mode write used ONLY when append fails: the event plus the
  // failure cause land on a separate durable path so a required audit record
  // is not silently lost. Implementations may share the primary store.
  appendDegraded?(event: AuditEvent, cause: string): Promise<void>;
  // Recovery sweep: replay degraded records into the primary log and clear
  // them from the fallback path. Replays are keyed by eventId so a retried
  // sweep never duplicates an event in the primary log. Records that still
  // fail stay on the fallback path for the next sweep.
  recoverDegraded?(tenantId: string, limit?: number): Promise<{ recovered: number; remaining: number }>;
}

export class MemoryAuditStore implements AuditStore {
  events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    // Mirrors the RTDB keyed path: identity is (tenantId, eventId).
    const existing = this.events.find((e) => e.eventId === event.eventId && e.tenantId === event.tenantId);
    if (existing) {
      if (sameAuditEvent(existing, event)) return; // idempotent replay
      throw new AuditConflictError(event.eventId);
    }
    this.events.push(event);
  }
  async list(tenantId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.tenantId === tenantId);
  }
  degraded: { event: AuditEvent; cause: string }[] = [];
  async appendDegraded(event: AuditEvent, cause: string): Promise<void> {
    if (!this.degraded.some((d) => d.event.eventId === event.eventId)) this.degraded.push({ event, cause });
  }
  async recoverDegraded(tenantId: string, limit = 25): Promise<{ recovered: number; remaining: number }> {
    const mine = this.degraded.filter((d) => d.event.tenantId === tenantId);
    const batch = mine.slice(0, limit);
    for (const d of batch) {
      if (!this.events.some((e) => e.eventId === d.event.eventId)) this.events.push(d.event);
    }
    this.degraded = this.degraded.filter((d) => !batch.includes(d));
    return { recovered: batch.length, remaining: this.degraded.filter((d) => d.event.tenantId === tenantId).length };
  }
}

export function auditEvent(input: Omit<AuditEvent, "eventId" | "at">): AuditEvent {
  return { ...input, eventId: `aud_${crypto.randomUUID()}`, at: new Date().toISOString() };
}
