// Mailbox notification subscriptions (PRD F15: renew watches before expiry
// and repair notification gaps). A subscription record binds a provider
// subscription id to exactly one tenant+sender so an inbound webhook
// notification can be routed to the right mailbox. The provider-side
// subscription itself is created out-of-band during the consent flow (OAuth
// consent required); this store is only the durable map, and no deployment
// is authorized to create provider subscriptions today.

import type { ISODate, SenderProvider } from "./types.ts";

export interface MailboxSubscription {
  tenantId: string;
  senderId: string;
  provider: SenderProvider;
  subscriptionId: string; // provider-assigned id (Graph subscription / watch id)
  resource: string | null; // Graph resource string when known
  expiresAt: ISODate; // provider-reported expiry; renew before this
  createdAt: ISODate;
  createdBy: string;
  renewedAt: ISODate | null;
}

export class SubscriptionConflictError extends Error {
  readonly subscriptionId: string;
  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} is already bound to a different tenant or sender`);
    this.name = "SubscriptionConflictError";
    this.subscriptionId = subscriptionId;
  }
}

function sameBinding(a: MailboxSubscription, b: MailboxSubscription): boolean {
  return a.tenantId === b.tenantId && a.senderId === b.senderId && a.provider === b.provider;
}

export interface SubscriptionStore {
  // Create-or-identical: re-registering the same binding is idempotent and
  // keeps the original record. A conflicting binding for the same
  // subscription id throws SubscriptionConflictError and NEVER rebinds:
  // silently moving a provider notification stream to another tenant or
  // sender would route mailbox sync to the wrong place.
  register(sub: MailboxSubscription): Promise<{ created: boolean }>;
  getBySubscriptionId(provider: SenderProvider, subscriptionId: string): Promise<MailboxSubscription | null>;
  listForTenant(tenantId: string): Promise<MailboxSubscription[]>;
  markRenewed(provider: SenderProvider, subscriptionId: string, expiresAt: ISODate, renewedAt: ISODate): Promise<void>;
}

export class MemorySubscriptionStore implements SubscriptionStore {
  subs = new Map<string, MailboxSubscription>();
  private key(provider: SenderProvider, subscriptionId: string): string {
    return `${provider}:${subscriptionId}`;
  }
  async register(sub: MailboxSubscription): Promise<{ created: boolean }> {
    const existing = this.subs.get(this.key(sub.provider, sub.subscriptionId));
    if (existing) {
      if (sameBinding(existing, sub)) return { created: false };
      throw new SubscriptionConflictError(sub.subscriptionId);
    }
    this.subs.set(this.key(sub.provider, sub.subscriptionId), sub);
    return { created: true };
  }
  async getBySubscriptionId(provider: SenderProvider, subscriptionId: string): Promise<MailboxSubscription | null> {
    return this.subs.get(this.key(provider, subscriptionId)) ?? null;
  }
  async listForTenant(tenantId: string): Promise<MailboxSubscription[]> {
    return [...this.subs.values()].filter((s) => s.tenantId === tenantId);
  }
  async markRenewed(provider: SenderProvider, subscriptionId: string, expiresAt: ISODate, renewedAt: ISODate): Promise<void> {
    const k = this.key(provider, subscriptionId);
    const existing = this.subs.get(k);
    if (!existing) throw new Error(`subscription ${subscriptionId} not found`);
    this.subs.set(k, { ...existing, expiresAt, renewedAt });
  }
}

export type RenewalState = "ok" | "renew_due" | "expired";

// Renew comfortably before provider expiry (default 24h) so a failed renewal
// still leaves repair time, per PRD F15 gap-repair guidance.
export function renewalState(sub: MailboxSubscription, now: Date, renewBeforeMs = 24 * 60 * 60 * 1000): RenewalState {
  const exp = Date.parse(sub.expiresAt);
  if (exp <= now.getTime()) return "expired";
  if (exp - now.getTime() <= renewBeforeMs) return "renew_due";
  return "ok";
}
