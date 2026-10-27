// RTDB-backed sender registry. Senders are created ONLY in pending_consent
// status. The single activation path is activateSenderFromConsent below,
// which is called exclusively by the OAuth consent callback after the
// provider verified the consented mailbox identity. checkDispatch requires
// an active sender, which keeps live dispatch unreachable until then.

import type { Sender } from "./types.ts";
import { createHash } from "node:crypto";
import { outboundDataRoot, rtdbCasPut, tenantRoot } from "./rtdb-store.ts";

async function db() {
  const { getAdminDatabase } = await import("../geo/admin-store.ts");
  const database = await getAdminDatabase();
  if (!database) throw new Error("RTDB admin not configured");
  return database;
}

function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40);
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
    // Global binding index for inbound webhooks (fail-closed lookup by
    // mailbox). Stores only the hash of the lowercased address.
    await database.ref(`${outboundDataRoot()}/senderByEmailHash/${emailHash(sender.email)}`).set({ tenantId: sender.tenantId, senderId: sender.senderId });
  }

  async findByEmail(email: string): Promise<{ tenantId: string; senderId: string } | null> {
    const database = await db();
    const snap = await database.ref(`${outboundDataRoot()}/senderByEmailHash/${emailHash(email)}`).get();
    return snap.exists() ? (snap.val() as { tenantId: string; senderId: string }) : null;
  }

  async getSender(tenantId: string, senderId: string): Promise<Sender | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/senders/${safeKey(senderId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Sender;
    return val.tenantId === tenantId ? val : null;
  }

  // The ONLY code path that may mark a sender active. Called exclusively by
  // the OAuth consent callback (completeConsent) after the provider verified
  // that the consented mailbox matches the registered sender email.
  async activateSenderFromConsent(tenantId: string, senderId: string, consentTraceId: string, scopes: string[]): Promise<Sender> {
    const sender = await this.getSender(tenantId, senderId);
    if (!sender) throw new Error("sender not found");
    if (sender.status !== "pending_consent" && sender.status !== "revoked") {
      throw new Error(`cannot activate sender in status ${sender.status}`);
    }
    const updated: Sender = { ...sender, status: "active", consentTraceId, scopes };
    // CAS: two simultaneous consent callbacks for the same sender cannot both
    // activate; the loser sees a real conflict.
    const ok = await rtdbCasPut<Sender>(
      `${tenantRoot(tenantId)}/senders/${safeKey(senderId)}`,
      (current) => !!current && current.tenantId === tenantId && (current.status === "pending_consent" || current.status === "revoked"),
      updated
    );
    if (!ok) throw new Error("sender_activation_conflict");
    return updated;
  }

  async revokeSender(tenantId: string, senderId: string): Promise<Sender> {
    const sender = await this.getSender(tenantId, senderId);
    if (!sender) throw new Error("sender not found");
    const updated: Sender = { ...sender, status: "revoked" };
    const database = await db();
    await database.ref(`${tenantRoot(tenantId)}/senders/${safeKey(senderId)}`).set(updated);
    return updated;
  }

  async listSenders(tenantId: string): Promise<Sender[]> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/senders`).get();
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, Sender>).filter((s) => s.tenantId === tenantId);
  }
}
