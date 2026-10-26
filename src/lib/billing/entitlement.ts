import type { BillingProvider, BillingRecord } from "./store";
import type { PlanId } from "@/lib/geo/plan";
import type { BillingInterval, PaidPlanId, RazorpayPlanId } from "./dodo";

export type IncomingStatus =
  | "active" // active / renewed / activated / charged / resumed
  | "grace" // on_hold / past_due: payment problem, customer keeps access while dunning/grace runs
  | "ended" // expired / cancelled / failed / halted: access ends
  | "unknown";

export interface IncomingEvent {
  provider: BillingProvider;
  eventId: string | null; // webhook delivery id, for dedupe
  eventAt: string | null; // ISO timestamp from the webhook payload, for ordering
  subscriptionId: string | null;
  customerId: string | null;
  customerEmail: string | null;
  plan: PaidPlanId;
  interval: BillingInterval | null;
  status: IncomingStatus;
  mode: "test" | "live";
  /** Provider-reported renewal semantics (Dodo subscription payload). */
  nextBillingDate?: string | null;
  cancelAtPeriodEnd?: boolean | null;
}

export type Decision =
  | { action: "upgrade"; plan: RazorpayPlanId; record: BillingRecord; note: string }
  | { action: "downgrade"; plan: "trial"; record: BillingRecord; note: string }
  | { action: "keep"; plan: RazorpayPlanId; record: BillingRecord; note: string }
  | { action: "ignore"; reason: string };

function toRecord(event: IncomingEvent, status: string, previous?: BillingRecord | null): BillingRecord {
  return {
    provider: event.provider,
    plan: event.plan,
    interval: event.interval,
    status,
    subscriptionId: event.subscriptionId,
    customerId: event.customerId,
    customerEmail: event.customerEmail,
    mode: event.mode,
    updatedAt: event.eventAt ?? new Date().toISOString(),
    // Renewal semantics come from provider payload fields; when an event
    // omits them, keep the last known values rather than dropping to unknown.
    nextBillingDate: event.nextBillingDate ?? previous?.nextBillingDate ?? null,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? previous?.cancelAtPeriodEnd ?? null,
  };
}

export function decideTransition(current: BillingRecord | null, event: IncomingEvent): Decision {
  // Out-of-order delivery: webhooks can arrive reordered; an event older than
  // the state we already applied must not move anything.
  if (current && event.eventAt && current.updatedAt && event.eventAt < current.updatedAt) {
    return { action: "ignore", reason: `stale event (${event.eventAt} < applied ${current.updatedAt})` };
  }
  // A terminal event for a subscription that is not the current one must not
  // clobber a newer subscription (e.g. slow cancel arriving after a resubscribe).
  const sameSubscription = !current?.subscriptionId || !event.subscriptionId || current.subscriptionId === event.subscriptionId;

  if (event.status === "active") {
    if (!sameSubscription && current && (current.status === "active" || current.status === "grace")) {
      // A different subscription activating while one is already live: switch to
      // the newer one; flag so the old one can be cancelled at the provider.
      return {
        action: "upgrade",
        plan: event.plan,
        record: toRecord(event, "active", current),
        note: `subscription switched from ${current.subscriptionId} (${current.provider}) - cancel the old one at its provider`,
      };
    }
    return { action: "upgrade", plan: event.plan, record: toRecord(event, "active", current), note: "subscription active" };
  }
  if (event.status === "grace") {
    if (!sameSubscription) return { action: "ignore", reason: "grace event for a superseded subscription" };
    // Customer keeps access through dunning/grace; only record the status.
    const plan = current?.plan ?? event.plan;
    return { action: "keep", plan, record: { ...toRecord(event, "grace", current), plan }, note: "payment issue - access kept during grace/dunning" };
  }
  if (event.status === "ended") {
    if (!sameSubscription) return { action: "ignore", reason: "terminal event for a superseded subscription" };
    return {
      action: "downgrade",
      plan: "trial" as PlanId as "trial",
      record: toRecord(event, event.status === "ended" ? "ended" : "ended"),
      note: "subscription ended - access revoked",
    };
  }
  return { action: "ignore", reason: `unhandled status ${event.status}` };
}
