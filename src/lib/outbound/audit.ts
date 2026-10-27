// Append-only audit trail (PRD section 07). One event per actor action with
// tenant, actor, action, target, outcome and time. The store exposes append
// and list ONLY - no update or delete methods exist, so tampering requires
// direct database access outside this module.

import type { ISODate } from "./types.ts";

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
  // is never silently lost. Implementations may share the primary store.
  appendDegraded?(event: AuditEvent, cause: string): Promise<void>;
}

export class MemoryAuditStore implements AuditStore {
  events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
  async list(tenantId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.tenantId === tenantId);
  }
  degraded: { event: AuditEvent; cause: string }[] = [];
  async appendDegraded(event: AuditEvent, cause: string): Promise<void> {
    this.degraded.push({ event, cause });
  }
}

export function auditEvent(input: Omit<AuditEvent, "eventId" | "at">): AuditEvent {
  return { ...input, eventId: `aud_${crypto.randomUUID()}`, at: new Date().toISOString() };
}
