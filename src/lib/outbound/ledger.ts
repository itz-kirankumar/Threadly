// Durable send ledger: the ledger owns truth, workflows do not.
// Pure transition logic; persistence lives behind the Store interface.

import type { DeliveryAttempt, MessageIntent, MessageStatus } from "./types.ts";

export function intentUniqueKey(parts: {
  tenantId: string;
  enrollmentId: string;
  campaignVersion: number;
  step: number;
}): string {
  return [parts.tenantId, parts.enrollmentId, `v${parts.campaignVersion}`, `s${parts.step}`].join(":");
}

const ALLOWED: Record<MessageStatus, MessageStatus[]> = {
  drafted: ["approved", "cancelled"],
  approved: ["scheduled", "cancelled"],
  scheduled: ["reserved", "cancelled"],
  reserved: ["dispatching", "scheduled", "cancelled"],
  dispatching: ["provider_accepted", "provider_rejected", "provider_unknown"],
  provider_unknown: ["reserved", "provider_accepted", "provider_rejected", "cancelled"],
  provider_accepted: ["bounced", "delivered_if_reported"],
  provider_rejected: [],
  bounced: [],
  delivered_if_reported: [],
  cancelled: [],
};

export class TransitionError extends Error {
  constructor(from: MessageStatus, to: MessageStatus, why: string) {
    super(`illegal transition ${from} -> ${to}: ${why}`);
    this.name = "TransitionError";
  }
}

export interface TransitionCtx {
  now: Date;
  actor: string;
  // Required when leaving provider_unknown back to reserved: proof that the
  // provider state was inspected. This is the no-blind-retry guard.
  reconciled?: boolean;
  reason?: string;
}

export function canTransition(from: MessageStatus, to: MessageStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(intent: MessageIntent, to: MessageStatus, ctx: TransitionCtx): MessageIntent {
  if (!canTransition(intent.status, to)) {
    throw new TransitionError(intent.status, to, "not an allowed edge");
  }
  if (intent.status === "provider_unknown" && to === "reserved" && !ctx.reconciled) {
    throw new TransitionError(intent.status, to, "requeue after unknown requires reconciled provider state");
  }
  const next: MessageIntent = {
    ...intent,
    status: to,
    statusUpdatedAt: ctx.now.toISOString(),
  };
  if (to === "cancelled") next.cancelReason = ctx.reason ?? "unspecified";
  if (to === "reserved") {
    next.leaseOwner = ctx.actor;
    next.leaseExpiresAt = new Date(ctx.now.getTime() + 5 * 60 * 1000).toISOString();
  }
  if (to === "scheduled" || to === "dispatching") {
    next.leaseOwner = null;
    next.leaseExpiresAt = null;
  }
  if (intent.status === "provider_unknown" && (to === "provider_accepted" || to === "provider_rejected")) {
    next.reconciledAt = ctx.now.toISOString();
  }
  return next;
}

// Cancellation applies to any state that has not reached the provider.
export function canCancel(status: MessageStatus): boolean {
  return ["drafted", "approved", "scheduled", "reserved", "provider_unknown"].includes(status);
}

export function outcomeFromAttempt(attempt: DeliveryAttempt): MessageStatus {
  if (attempt.outcome === "accepted") return "provider_accepted";
  if (attempt.outcome === "rejected") return "provider_rejected";
  return "provider_unknown";
}

// Reconcile an unknown outcome against an observed provider state.
// still_unknown means keep quarantined; never requeue from here.
export type Reconciliation =
  | { kind: "accepted"; providerCorrelationId: string }
  | { kind: "rejected"; detail: string }
  | { kind: "still_unknown" };

export function resolveReconciliation(
  intent: MessageIntent,
  rec: Reconciliation,
  ctx: TransitionCtx
): MessageIntent {
  if (intent.status !== "provider_unknown") {
    throw new TransitionError(intent.status, "provider_unknown", "reconciliation only applies to unknown outcomes");
  }
  if (rec.kind === "accepted") return transition(intent, "provider_accepted", ctx);
  if (rec.kind === "rejected") return transition(intent, "provider_rejected", ctx);
  return intent;
}

// Store contract. Implementations must make createIntentIfAbsent atomic on
// uniqueKey, and compareAndSetStatus atomic on the stored status.
export interface LedgerStore {
  createIntentIfAbsent(intent: MessageIntent): Promise<"created" | "duplicate">;
  getIntent(tenantId: string, intentId: string): Promise<MessageIntent | null>;
  findIntentByUniqueKey(uniqueKey: string): Promise<MessageIntent | null>;
  compareAndSetStatus(
    tenantId: string,
    intentId: string,
    expected: MessageStatus,
    next: MessageIntent
  ): Promise<boolean>;
  appendAttempt(attempt: DeliveryAttempt): Promise<void>;
  listAttempts(tenantId: string, intentId: string): Promise<DeliveryAttempt[]>;
}

// In-memory store for tests and staging contract runs. Not for production.
export class MemoryLedgerStore implements LedgerStore {
  private intents = new Map<string, MessageIntent>();
  private attempts = new Map<string, DeliveryAttempt[]>();

  async createIntentIfAbsent(intent: MessageIntent): Promise<"created" | "duplicate"> {
    if (this.intents.has(intent.uniqueKey)) return "duplicate";
    this.intents.set(intent.uniqueKey, intent);
    return "created";
  }

  async getIntent(tenantId: string, intentId: string): Promise<MessageIntent | null> {
    for (const i of this.intents.values()) {
      if (i.tenantId === tenantId && i.intentId === intentId) return i;
    }
    return null;
  }

  async findIntentByUniqueKey(uniqueKey: string): Promise<MessageIntent | null> {
    return this.intents.get(uniqueKey) ?? null;
  }

  async compareAndSetStatus(
    tenantId: string,
    intentId: string,
    expected: MessageStatus,
    next: MessageIntent
  ): Promise<boolean> {
    const current = await this.getIntent(tenantId, intentId);
    if (!current || current.status !== expected) return false;
    this.intents.set(current.uniqueKey, next);
    return true;
  }

  async appendAttempt(attempt: DeliveryAttempt): Promise<void> {
    const list = this.attempts.get(attempt.intentId) ?? [];
    list.push(attempt);
    this.attempts.set(attempt.intentId, list);
  }

  async listAttempts(_tenantId: string, intentId: string): Promise<DeliveryAttempt[]> {
    return this.attempts.get(intentId) ?? [];
  }
}
