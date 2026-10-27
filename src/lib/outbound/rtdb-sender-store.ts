// RTDB-backed sender registry. Senders are created ONLY in pending_consent
// status: activation requires a real OAuth consent flow (not built), so no
// code path here can mark a sender active. checkDispatch requires an active
// sender, which keeps the whole send pipeline unreachable until then.

import type { Sender } from "./types.ts";
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

export class RtdbSenderStore {
  async saveSender(sender: Sender): Promise<void> {
    if (sender.status !== "pending_consent" && sender.status !== "paused" && sender.status !== "revoked") {
      throw new Error("senders can only be written as pending_consent, paused or revoked from this surface");
    }
    const database = await db();
    await database.ref(`${tenantRoot(sender.tenantId)}/senders/${safeKey(sender.senderId)}`).set(sender);
  }

  async getSender(tenantId: string, senderId: string): Promise<Sender | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/senders/${safeKey(senderId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Sender;
    return val.tenantId === tenantId ? val : null;
  }

  async listSenders(tenantId: string): Promise<Sender[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/senders`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, Sender>).filter((s) => s.tenantId === tenantId);
  }
}
