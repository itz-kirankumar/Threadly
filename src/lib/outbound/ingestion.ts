// Provider event ingestion (PRD F15). Event-key dedup: a duplicate webhook
// delivery is recorded once. Human replies set humanReplySeenAt and cancel
// pre-dispatch intents BEFORE any classification. Hard bounces and
// complaints create suppressions immediately. The sync cursor per sender
// drives stale-sync detection; dispatch must pause when sync is stale.

import { addSuppression, recordHumanReply } from "./campaign.ts";
import type { CampaignStore } from "./campaign.ts";
import type { ConversationStore } from "./conversations.ts";
import type { Contact, Conversation, ISODate } from "./types.ts";

export type InboundKind = "reply" | "hard_bounce" | "complaint";

export interface InboundEvent {
  tenantId: string;
  eventKey: string; // provider-guaranteed unique key (message id + event type)
  kind: InboundKind;
  senderId: string;
  contactEmail: string;
  providerMessageId: string | null;
  occurredAt: ISODate;
  cursor: string | null; // provider history/subscription cursor
}

export interface SyncCursor {
  tenantId: string;
  senderId: string;
  cursor: string;
  syncedAt: ISODate;
}

export interface IngestionStore {
  hasEvent(tenantId: string, eventKey: string): Promise<boolean>;
  saveEvent(e: InboundEvent & { receivedAt: ISODate }): Promise<void>;
  getCursor(tenantId: string, senderId: string): Promise<SyncCursor | null>;
  saveCursor(c: SyncCursor): Promise<void>;
}

export class MemoryIngestionStore implements IngestionStore {
  events = new Map<string, InboundEvent & { receivedAt: ISODate }>();
  cursors = new Map<string, SyncCursor>();

  async hasEvent(tenantId: string, eventKey: string): Promise<boolean> {
    return this.events.has(`${tenantId}:${eventKey}`);
  }
  async saveEvent(e: InboundEvent & { receivedAt: ISODate }): Promise<void> {
    this.events.set(`${e.tenantId}:${e.eventKey}`, e);
  }
  async getCursor(tenantId: string, senderId: string): Promise<SyncCursor | null> {
    return this.cursors.get(`${tenantId}:${senderId}`) ?? null;
  }
  async saveCursor(c: SyncCursor): Promise<void> {
    this.cursors.set(`${c.tenantId}:${c.senderId}`, c);
  }
}

// Stale sync must pause dispatch (PRD F15: stale sync pauses dispatch).
export function syncHealth(cursor: SyncCursor | null, now: Date, staleMs = 5 * 60 * 1000): "ok" | "stale" | "never_synced" {
  if (!cursor) return "never_synced";
  return now.getTime() - Date.parse(cursor.syncedAt) > staleMs ? "stale" : "ok";
}

export interface IngestResult {
  deduped: boolean;
  action: "none" | "reply_recorded" | "suppressed";
  cancelledIntents?: number;
}

export async function ingestProviderEvent(
  stores: {
    ingestion: IngestionStore;
    campaigns: CampaignStore;
    conversations: ConversationStore;
    contacts: { findByEmail(tenantId: string, email: string): Promise<Contact | null> };
  },
  event: InboundEvent,
  input: { now: Date }
): Promise<IngestResult> {
  if (await stores.ingestion.hasEvent(event.tenantId, event.eventKey)) {
    return { deduped: true, action: "none" };
  }
  const nowIso = input.now.toISOString();
  await stores.ingestion.saveEvent({ ...event, receivedAt: nowIso });
  if (event.cursor) {
    await stores.ingestion.saveCursor({ tenantId: event.tenantId, senderId: event.senderId, cursor: event.cursor, syncedAt: nowIso });
  }
  const contact = await stores.contacts.findByEmail(event.tenantId, event.contactEmail);
  if (!contact) return { deduped: false, action: "none" };

  if (event.kind === "reply") {
    // humanReplySeenAt is written before any classification.
    const conversationId = `cv_${contact.contactId}`;
    const existing = await stores.conversations.listConversations(event.tenantId);
    const conversation = existing.find((c) => c.contactId === contact.contactId);
    const record: Conversation = {
      tenantId: event.tenantId,
      conversationId: conversation?.conversationId ?? conversationId,
      contactId: contact.contactId,
      enrollmentId: conversation?.enrollmentId ?? null,
      humanReplySeenAt: nowIso,
      classification: conversation?.classification ?? null,
      classifiedBy: conversation?.classifiedBy ?? null,
      ownerUserId: conversation?.ownerUserId ?? null,
      createdAt: conversation?.createdAt ?? nowIso,
      createdBy: conversation?.createdBy ?? "ingestion",
    };
    await stores.conversations.saveConversation(record);
    if (conversation?.enrollmentId) {
      const enrollment = await stores.campaigns.getEnrollmentById(event.tenantId, conversation.enrollmentId);
      if (enrollment) {
        const intents = await stores.campaigns.listIntentsByCampaign(event.tenantId, enrollment.campaignId);
        const result = await recordHumanReply(stores.campaigns, {
          tenantId: event.tenantId,
          enrollment,
          intents,
          actor: "ingestion",
          now: input.now,
        });
        return { deduped: false, action: "reply_recorded", cancelledIntents: result.cancelledIntents };
      }
    }
    return { deduped: false, action: "reply_recorded", cancelledIntents: 0 };
  }

  // hard bounce or complaint: suppress immediately, reimport cannot resurrect.
  // addSuppression dedups on the email token: the first suppression wins the record.
  await addSuppression(stores.campaigns, {
    tenantId: event.tenantId,
    email: contact.email,
    reason: event.kind === "hard_bounce" ? "hard_bounce" : "complaint",
    source: `provider_event:${event.eventKey}`,
    actor: "ingestion",
    now: input.now,
  });
  return { deduped: false, action: "suppressed" };
}
