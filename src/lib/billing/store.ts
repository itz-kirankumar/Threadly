import { readData, writeData } from "@/lib/portal-db";
import type { BillingInterval, PaidPlanId } from "./dodo";

export interface BillingRecord {
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
