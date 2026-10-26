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
    // Promo consumption is a property of the workspace, not the current plan:
    // renewals and switches must not reset it.
    promoConsumed: previous?.promoConsumed || undefined,
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

export type ClaimGrantDecision =
  | { ok: true; record: BillingRecord }
  | { ok: false; reason: "active_plan" | "promo_consumed" };

/** Atomic guest-claim grant decision, applied inside an RTDB transaction on
 * the workspace billing node: any live entitlement (active/grace) aborts -
 * an existing paid plan can never be overwritten or extended by a claim, and
 * concurrent claims for one workspace have exactly one winner. A lapsed promo
 * leaves status "ended" with promoConsumed set, blocking a second promo while
 * still allowing a paid purchase to attach. Retrying the SAME claim after a
 * successful grant is stopped earlier by the claim record's own status, so a
 * retry can never reset or extend the term. */
export function decideClaimGrant(
  current: BillingRecord | null,
  grant: {
    provider: BillingRecord["provider"];
    plan: BillingRecord["plan"];
    interval: BillingRecord["interval"];
    amount: number;
    orderId: string;
    claimId: string;
    customerEmail: string | null;
    mode: "test" | "live";
    periodEnd: string | null;
    now: Date;
  },
): ClaimGrantDecision {
  // Same claim already granted this term: idempotent no-op. A retry after a
  // partial attach (billing committed, plan record or claim marker failed)
  // completes the remaining steps instead of being rejected as active_plan,
  // and the committed record - including its periodEnd - is never rewritten.
  if (current && current.claimId === grant.claimId && current.status === "active") {
    return { ok: true, record: current };
  }
  if (current && (current.status === "active" || current.status === "grace")) {
    return { ok: false, reason: "active_plan" };
  }
  if (grant.provider === "promo" && current?.promoConsumed) {
    return { ok: false, reason: "promo_consumed" };
  }
  return {
    ok: true,
    record: {
      provider: grant.provider,
      plan: grant.plan,
      interval: grant.interval,
      status: "active",
      subscriptionId: null,
      customerId: null,
      customerEmail: grant.customerEmail,
      mode: grant.mode,
      updatedAt: grant.now.toISOString(),
      periodEnd: grant.periodEnd,
      orderId: grant.orderId,
      paidThisTerm: grant.amount,
      claimId: grant.claimId,
      promoConsumed: grant.provider === "promo" ? true : current?.promoConsumed || undefined,
    },
  };
}
