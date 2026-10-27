// Dispatch runner. Moves reviewed (approved) intents through the lifecycle:
// approved -> scheduled -> reserved -> dispatching -> provider_*.
// Every gate in checkDispatch applies before any provider call, including the
// cost-unknown deny. The provider is an adapter interface; the only adapter
// that exists is the mock, which performs NO external send - it records an
// accepted outcome locally so the full loop can be exercised. Real provider
// adapters (OAuth-gated) do not exist yet.

import type { CampaignStore } from "./campaign.ts";
import type { LedgerStore } from "./ledger.ts";
import { transition } from "./ledger.ts";
import type { DraftStore } from "./drafts.ts";
import type { ContactStore } from "./planner.ts";
import { checkDispatch, suppressionTokenFor } from "./policy.ts";
import type { UsageStore } from "./usage.ts";
import type { DeliveryAttempt, MessageIntent, Sender } from "./types.ts";

export interface SenderReader {
  getSender(tenantId: string, senderId: string): Promise<Sender | null>;
}

export interface DispatchProvider {
  name: string;
  send(input: { sender: Sender; intent: MessageIntent; subject: string; body: string; to: string }): Promise<{
    outcome: "accepted" | "rejected" | "unknown";
    correlationId: string | null;
    statusCode: number | null;
    detail: string | null;
    // True when no external send occurred (mock path). Synthetic outcomes are
    // excluded from real sent/provider delivery counts.
    synthetic: boolean;
  }>;
}

// Performs no external send. Exists so the dispatch path can be exercised end
// to end without OAuth grants or real outreach.
export class MockDispatchProvider implements DispatchProvider {
  name = "mock";
  async send(input: { sender: Sender; intent: MessageIntent }): Promise<{
    outcome: "accepted";
    correlationId: string;
    statusCode: number;
    detail: string;
    synthetic: true;
  }> {
    return {
      outcome: "accepted",
      correlationId: `mock_${input.intent.intentId}`,
      statusCode: 200,
      detail: "mock adapter: no external send occurred",
      synthetic: true,
    };
  }
}

export interface DispatchStores {
  campaigns: CampaignStore;
  ledger: LedgerStore;
  drafts: DraftStore;
  senders: SenderReader;
  contacts: ContactStore;
  usage: UsageStore;
}

export interface DispatchResult {
  dispatched: { intentId: string; attemptId: string; outcome: string }[];
  deferred: { intentId: string; reasons: string[] }[];
  skipped: { intentId: string; reason: string }[];
}

function startOfDay(now: Date): number {
  return Date.parse(now.toISOString().slice(0, 10) + "T00:00:00.000Z");
}

export async function runDispatch(
  stores: DispatchStores,
  provider: DispatchProvider,
  input: { tenantId: string; campaignId: string; actor: string; now: Date }
): Promise<DispatchResult> {
  const { campaigns, ledger, drafts, senders, contacts, usage } = stores;
  const { tenantId, campaignId, actor, now } = input;
  const result: DispatchResult = { dispatched: [], deferred: [], skipped: [] };

  const campaign = await campaigns.latestCampaignVersion(tenantId, campaignId);
  const approval = campaign ? await campaigns.getApprovalForVersion(tenantId, campaignId, campaign.version) : null;
  const events = await usage.listUsage(tenantId);
  const tenantCostComplete = !events.some((e) => e.costMinorUnits === null);
  const tenantCostToDate = events.reduce((sum, e) => sum + (e.costMinorUnits ?? 0), 0);

  const allIntents = await campaigns.listIntentsByCampaign(tenantId, campaignId);
  // Lease expiry NEVER authorizes retrying a possibly-external send. Stranded
  // dispatching/provider_unknown intents are reported, not retried: a real
  // provider adapter would need reconciliation first (and mock-only
  // validation does not establish real-provider retry safety).
  for (const i of allIntents) {
    if (i.status === "dispatching" || i.status === "provider_unknown") {
      result.skipped.push({ intentId: i.intentId, reason: `${i.status}_stranded_needs_reconciliation` });
    }
  }
  const intents = allIntents.filter(
    (i) =>
      i.status === "approved" ||
      i.status === "scheduled" ||
      // Crash recovery, reserved-before-dispatch ONLY: in "reserved" no
      // provider call has happened yet, so reclaiming an expired reservation
      // cannot repeat an external send.
      (i.status === "reserved" && i.leaseExpiresAt !== null && Date.parse(i.leaseExpiresAt) <= now.getTime())
  );
  for (const intent of intents) {
    const draft = await drafts.getDraftForIntent(tenantId, intent.intentId);
    if (!draft) {
      result.skipped.push({ intentId: intent.intentId, reason: "draft_missing" });
      continue;
    }
    // Reserve (CAS each edge; another runner may hold the intent).
    let current = intent;
    if (current.status === "reserved") {
      // Reclaimed stale reservation: evaluate gates directly.
    } else if (current.status === "approved") {
      const next = transition(current, "scheduled", { actor, now });
      if (!(await ledger.compareAndSetStatus(tenantId, intent.intentId, "approved", next))) {
        result.skipped.push({ intentId: intent.intentId, reason: "reservation_conflict" });
        continue;
      }
      current = next;
      await campaigns.saveIntent(current);
    }
    if (current.status !== "reserved") {
      const reserved = transition(current, "reserved", { actor, now });
      if (!(await ledger.compareAndSetStatus(tenantId, intent.intentId, "scheduled", reserved))) {
        result.skipped.push({ intentId: intent.intentId, reason: "reservation_conflict" });
        continue;
      }
      current = reserved;
      await campaigns.saveIntent(current);
    }

    const sender = intent.senderId ? await senders.getSender(tenantId, intent.senderId) : null;
    const acceptedToday = await countAcceptedToday(ledger, tenantId, campaignId, intent.senderId, campaigns, now);
    const enrollment = (await campaigns.listEnrollments(tenantId, campaignId)).find((e) => e.enrollmentId === intent.enrollmentId);
    const contact = await contacts.getContact(tenantId, intent.contactId);
    const suppressed = contact
      ? Boolean(await campaigns.findSuppression(tenantId, suppressionTokenFor(tenantId, contact.email)))
      : true; // contact missing: treat as suppressed (fail closed)
    const decision = checkDispatch({
      intent: current,
      campaign,
      approval,
      sender,
      contactSuppressed: suppressed,
      enrollmentStatus: enrollment?.status ?? "missing",
      humanReplySeen: false, // reply-cancellation removes intents from approved/scheduled before dispatch
      senderAcceptedToday: acceptedToday,
      tenantCostToDate,
      tenantCostComplete,
      now,
    });

    if (!decision.allow) {
      const back = transition(current, "scheduled", { actor, now });
      await ledger.compareAndSetStatus(tenantId, intent.intentId, "reserved", back);
      await campaigns.saveIntent(back);
      result.deferred.push({ intentId: intent.intentId, reasons: decision.reasons });
      continue;
    }

    const dispatching = transition(current, "dispatching", { actor, now });
    await ledger.compareAndSetStatus(tenantId, intent.intentId, "reserved", dispatching);
    await campaigns.saveIntent(dispatching);

    const sendResult = await provider.send({ sender: sender!, intent: dispatching, subject: draft.subject, body: draft.body, to: contact ? contact.email : "" });
    const attempt: DeliveryAttempt = {
      tenantId,
      attemptId: `at_${intent.intentId.replace(/^mi_/, "")}`,
      intentId: intent.intentId,
      dispatchedAt: now.toISOString(),
      provider: sender!.provider,
      providerCorrelationId: sendResult.correlationId,
      outcome: sendResult.outcome,
      providerStatusCode: sendResult.statusCode,
      detail: sendResult.detail,
      synthetic: sendResult.synthetic,
      createdAt: now.toISOString(),
      createdBy: actor,
    };
    await ledger.appendAttempt(attempt);
    const finalStatus =
      sendResult.outcome === "accepted" ? "provider_accepted" : sendResult.outcome === "rejected" ? "provider_rejected" : "provider_unknown";
    const final = transition(dispatching, finalStatus, { actor, now });
    await ledger.compareAndSetStatus(tenantId, intent.intentId, "dispatching", final);
    await campaigns.saveIntent(final);
    result.dispatched.push({ intentId: intent.intentId, attemptId: attempt.attemptId, outcome: sendResult.outcome });

    if (sendResult.outcome === "accepted") {
      await usage.recordUsage({
        tenantId,
        usageId: `ug_send_${intent.intentId.replace(/^mi_/, "")}`,
        kind: "send",
        units: 1,
        idempotencyKey: `send:${intent.intentId}:${attempt.attemptId}`,
        // Synthetic (mock) outcomes: no external cost exists, so this is a
        // true zero. Real providers must record their verified price or null
        // (which fails tenantCostComplete and blocks further dispatch).
        costMinorUnits: sendResult.synthetic ? 0 : null,
        currency: sendResult.synthetic ? "USD" : null,
        ...(sendResult.synthetic ? { synthetic: true } : {}),
        createdAt: now.toISOString(),
        createdBy: actor,
      });
    }
  }
  return result;
}

async function countAcceptedToday(
  ledger: LedgerStore,
  tenantId: string,
  campaignId: string,
  senderId: string,
  campaigns: CampaignStore,
  now: Date
): Promise<number> {
  const dayStart = startOfDay(now);
  const intents = await campaigns.listIntentsByCampaign(tenantId, campaignId);
  let count = 0;
  for (const i of intents) {
    if (i.senderId !== senderId) continue;
    const attempts = await ledger.listAttempts(tenantId, i.intentId);
    // Synthetic (mock) attempts are not provider-accepted sends.
    count += attempts.filter((a) => a.outcome === "accepted" && !a.synthetic && Date.parse(a.dispatchedAt) >= dayStart).length;
  }
  return count;
}
