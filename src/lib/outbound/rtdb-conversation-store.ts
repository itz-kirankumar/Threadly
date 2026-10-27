import type { Conversation, Meeting } from "./types.ts";
import type { ConversationStore } from "./conversations.ts";
import { tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function safeKey(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("invalid key");
  return id;
}

export class RtdbConversationStore implements ConversationStore {
  async saveConversation(c: Conversation): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(c.tenantId)}/conversations/${safeKey(c.conversationId)}`).set(c);
  }
  async getConversation(tenantId: string, conversationId: string): Promise<Conversation | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/conversations/${safeKey(conversationId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Conversation;
    return val.tenantId === tenantId ? val : null;
  }
  async listConversations(tenantId: string): Promise<Conversation[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/conversations`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, Conversation>).filter((c) => c.tenantId === tenantId);
  }
  async saveMeeting(m: Meeting): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(m.tenantId)}/meetings/${safeKey(m.meetingId)}`).set(m);
  }
  async getMeeting(tenantId: string, meetingId: string): Promise<Meeting | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/meetings/${safeKey(meetingId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Meeting;
    return val.tenantId === tenantId ? val : null;
  }
  async listMeetings(tenantId: string): Promise<Meeting[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/meetings`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, Meeting>).filter((m) => m.tenantId === tenantId);
  }
}
