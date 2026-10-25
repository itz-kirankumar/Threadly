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
