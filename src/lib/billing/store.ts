import { readData, writeData } from "@/lib/portal-db";
import type { BillingInterval, PaidPlanId } from "./dodo";

export type BillingProvider = "dodo" | "razorpay";

export interface BillingRecord {
  provider: BillingProvider;
  plan: PaidPlanId;
  interval: BillingInterval | null;
  status: string;
  subscriptionId: string | null;
  customerId: string | null;
  customerEmail: string | null;
  mode: "test" | "live";
  updatedAt: string;
  /** One-time (Razorpay order) entitlements: when the paid term ends. */
  periodEnd?: string | null;
  orderId?: string | null;
  // Total actually paid (subunits) toward the CURRENT term, including upgrade
  // top-ups. This - never today's catalog price - is the upgrade credit basis.
  paidThisTerm?: number | null;
}

const BILLING_ROOT = "geo/billing";

export async function loadBilling(): Promise<BillingRecord | null> {
  return readData<BillingRecord>(BILLING_ROOT);
}

export async function saveBilling(record: BillingRecord): Promise<void> {
  await writeData(BILLING_ROOT, record);
}

const EVENTS_ROOT = "geo/billingEvents";
const EVENTS_CAP = 200;

/** Recently processed webhook delivery ids, for at-least-once delivery dedupe. */
export async function webhookEventProcessed(eventId: string): Promise<boolean> {
  const ids = (await readData<string[]>(EVENTS_ROOT)) ?? [];
  return ids.includes(eventId);
}

export async function recordWebhookEvent(eventId: string): Promise<void> {
  const ids = (await readData<string[]>(EVENTS_ROOT)) ?? [];
  await writeData(EVENTS_ROOT, [eventId, ...ids.filter((id) => id !== eventId)].slice(0, EVENTS_CAP));
}

// ---- durable one-at-a-time checkout attempts (atomic via RTDB transaction) ----

import { getAdminDatabase } from "@/lib/geo/admin-store";
import { evaluateAttempt, type CheckoutAttempt } from "./attempt";

const attemptPath = (workspaceUid: string) => `users/${workspaceUid}/geo/billingAttempt`;

export async function loadCheckoutAttempt(workspaceUid: string): Promise<CheckoutAttempt | null> {
  const snapshot = await (await getAdminDatabase()).ref(attemptPath(workspaceUid)).get();
  return (snapshot.val() as CheckoutAttempt | null) ?? null;
}

export async function saveCheckoutAttempt(workspaceUid: string, attempt: CheckoutAttempt): Promise<void> {
  await (await getAdminDatabase()).ref(attemptPath(workspaceUid)).set(attempt);
}

/** Atomically claim the attempt slot. Commits only when the slot is open. */
export async function claimCheckoutAttempt(
  workspaceUid: string,
  attempt: CheckoutAttempt,
  now: Date,
): Promise<{ claimed: boolean; existing: CheckoutAttempt | null }> {
  const ref = (await getAdminDatabase()).ref(attemptPath(workspaceUid));
  const result = await ref.transaction((current: CheckoutAttempt | null) => {
    return evaluateAttempt(current, now).open ? attempt : undefined; // undefined aborts the transaction
  });
  return { claimed: result.committed, existing: (result.snapshot.val() as CheckoutAttempt | null) ?? null };
}
