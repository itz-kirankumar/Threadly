// Conversation and meeting records. humanReplySeenAt is set before any
// classification (PRD F15); classification never resurrects follow-ups —
// the enrollment's "replied" status and cancelled intents are the mechanism.

import type { Conversation, ConversationIntent, Meeting } from "./types.ts";

export const INTENTS: ConversationIntent[] = [
  "interested", "not_now", "negative", "opt_out", "wrong_person", "out_of_office", "uncertain",
];

export interface ConversationStore {
  saveConversation(c: Conversation): Promise<void>;
  getConversation(tenantId: string, conversationId: string): Promise<Conversation | null>;
  listConversations(tenantId: string): Promise<Conversation[]>;
  saveMeeting(m: Meeting): Promise<void>;
  getMeeting(tenantId: string, meetingId: string): Promise<Meeting | null>;
  listMeetings(tenantId: string): Promise<Meeting[]>;
}

export class MemoryConversationStore implements ConversationStore {
  conversations = new Map<string, Conversation>();
  meetings = new Map<string, Meeting>();

  async saveConversation(c: Conversation): Promise<void> {
    this.conversations.set(`${c.tenantId}:${c.conversationId}`, c);
  }
  async getConversation(tenantId: string, conversationId: string): Promise<Conversation | null> {
    return this.conversations.get(`${tenantId}:${conversationId}`) ?? null;
  }
  async listConversations(tenantId: string): Promise<Conversation[]> {
    return [...this.conversations.values()].filter((c) => c.tenantId === tenantId);
  }
  async saveMeeting(m: Meeting): Promise<void> {
    this.meetings.set(`${m.tenantId}:${m.meetingId}`, m);
  }
  async getMeeting(tenantId: string, meetingId: string): Promise<Meeting | null> {
    return this.meetings.get(`${tenantId}:${meetingId}`) ?? null;
  }
  async listMeetings(tenantId: string): Promise<Meeting[]> {
    return [...this.meetings.values()].filter((m) => m.tenantId === tenantId);
  }
}

// Classify only when explicitly requested; "uncertain" is always a valid
// outcome and never routes to automated action.
export function classifyReplyText(text: string): ConversationIntent {
  const t = text.toLowerCase();
  if (/\b(unsubscribe|opt.?out|stop emailing|remove me|do not contact)\b/.test(t)) return "opt_out";
  if (/\b(out of office|ooo|on vacation|away until)\b/.test(t)) return "out_of_office";
  if (/\b(not interested|no thanks|pass)\b/.test(t)) return "negative";
  if (/\b(not the right|wrong person|try my colleague)\b/.test(t)) return "wrong_person";
  if (/\b(later|not now|next quarter|circle back)\b/.test(t)) return "not_now";
  if (/\b(interested|sounds good|let'?s talk|book|schedule|send over)\b/.test(t)) return "interested";
  return "uncertain";
}

// F16: editable classification and owner routing.
// - A human reclassification is authoritative and editable at any time; it
//   records classifiedBy "human". It never touches humanReplySeenAt and
//   never resumes a stopped sequence: reclassification informs handling,
//   it does not resurrect follow-ups.
// - Owner routing assigns the person responsible. "Uncertain" auto
//   classifications must reach a person: routeUncertain assigns the given
//   owner when the conversation is uncertain and unowned.

export interface ConversationStoreOps {
  getConversation(tenantId: string, conversationId: string): Promise<Conversation | null>;
  saveConversation(c: Conversation): Promise<void>;
}

export async function reclassifyConversation(
  store: ConversationStoreOps,
  input: { tenantId: string; conversationId: string; intent: ConversationIntent; actor: string },
): Promise<Conversation> {
  const conv = await store.getConversation(input.tenantId, input.conversationId);
  if (!conv) throw new Error("conversation not found");
  const updated: Conversation = { ...conv, classification: input.intent, classifiedBy: "human" };
  await store.saveConversation(updated);
  return updated;
}

export async function assignConversationOwner(
  store: ConversationStoreOps,
  input: { tenantId: string; conversationId: string; ownerUserId: string; actor: string },
): Promise<Conversation> {
  const conv = await store.getConversation(input.tenantId, input.conversationId);
  if (!conv) throw new Error("conversation not found");
  const updated: Conversation = { ...conv, ownerUserId: input.ownerUserId };
  await store.saveConversation(updated);
  return updated;
}

// "Uncertain reaches a person": when the latest classification is uncertain
// and nobody owns the conversation, assign the fallback owner. Returns the
// conversation and whether an assignment happened.
export async function routeUncertain(
  store: ConversationStoreOps,
  input: { tenantId: string; conversationId: string; fallbackOwnerUserId: string },
): Promise<{ conversation: Conversation; assigned: boolean }> {
  const conv = await store.getConversation(input.tenantId, input.conversationId);
  if (!conv) throw new Error("conversation not found");
  if (conv.classification !== "uncertain" || conv.ownerUserId !== null) {
    return { conversation: conv, assigned: false };
  }
  const updated: Conversation = { ...conv, ownerUserId: input.fallbackOwnerUserId };
  await store.saveConversation(updated);
  return { conversation: updated, assigned: true };
}

