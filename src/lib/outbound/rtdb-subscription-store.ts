// RTDB-backed SubscriptionStore. Subscriptions are indexed GLOBALLY by
// provider+subscriptionId (not under the tenant root) because an inbound
// webhook notification arrives without any tenant context: the binding
// lookup is the whole point. The stored record carries tenantId and every
// consumer routes by the record, never by the caller. Registration is
// create-or-identical via REST ETag CAS: a conflicting binding throws
// SubscriptionConflictError rather than rebinding.

import type { ISODate, SenderProvider } from "./types.ts";
import type { MailboxSubscription, SubscriptionStore } from "./subscriptions.ts";
import { SubscriptionConflictError } from "./subscriptions.ts";
import { outboundDataRoot, rtdbCasPut } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function safeKey(id: string): string {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new Error("invalid key");
  return id;
}

function path(provider: SenderProvider, subscriptionId: string): string {
  return `${outboundDataRoot()}/subscriptions/${provider}/${safeKey(subscriptionId)}`;
}

export class RtdbSubscriptionStore implements SubscriptionStore {
  async register(sub: MailboxSubscription): Promise<{ created: boolean }> {
    let created = false;
    const wrote = await rtdbCasPut<MailboxSubscription>(
      path(sub.provider, sub.subscriptionId),
      (current) => {
        if (current === null) {
          created = true;
          return true;
        }
        return current.tenantId === sub.tenantId && current.senderId === sub.senderId && current.provider === sub.provider;
      },
      sub,
    );
    if (!wrote) throw new SubscriptionConflictError(sub.subscriptionId);
    return { created };
  }

  async getBySubscriptionId(provider: SenderProvider, subscriptionId: string): Promise<MailboxSubscription | null> {
    const database = await db();
    const snap = await database.ref(path(provider, subscriptionId)).get();
    if (!snap.exists()) return null;
    return snap.val() as MailboxSubscription;
  }

  // Prototype scale: one node read, filtered in memory. Fine for tens of
  // senders; a per-tenant index is needed before real fleet scale.
  async listForTenant(tenantId: string): Promise<MailboxSubscription[]> {
    const database = await db();
    const out: MailboxSubscription[] = [];
    for (const provider of ["gmail", "microsoft"] as SenderProvider[]) {
      const snap = await database.ref(`${outboundDataRoot()}/subscriptions/${provider}`).get();
      if (!snap.exists()) continue;
      const val = snap.val() as Record<string, MailboxSubscription>;
      for (const sub of Object.values(val)) {
        if (sub && sub.tenantId === tenantId) out.push(sub);
      }
    }
    return out;
  }

  async markRenewed(provider: SenderProvider, subscriptionId: string, expiresAt: ISODate, renewedAt: ISODate): Promise<void> {
    const database = await db();
    const ref = database.ref(path(provider, subscriptionId));
    const snap = await ref.get();
    if (!snap.exists()) throw new Error(`subscription ${subscriptionId} not found`);
    await ref.set({ ...(snap.val() as MailboxSubscription), expiresAt, renewedAt });
  }
}
