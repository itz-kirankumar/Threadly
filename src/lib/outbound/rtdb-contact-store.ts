// RTDB-backed ContactStore. Contacts and rights records live under the
// tenant root; reads re-verify tenantId. Raw emails are stored on the
// contact record itself (needed for sending) but never in RTDB paths.

import type { Contact, RightsRecord } from "./types.ts";
import type { ContactStore } from "./planner.ts";
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

export class RtdbContactStore implements ContactStore {
  async getContact(tenantId: string, contactId: string): Promise<Contact | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/contacts/${safeKey(contactId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as Contact;
    return val.tenantId === tenantId ? val : null;
  }

  async getRightsForContact(tenantId: string, contactId: string): Promise<RightsRecord | null> {
    const database = await db();
    const snap = await database.ref(`${tenantRoot(tenantId)}/rightsByContact/${safeKey(contactId)}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() as RightsRecord;
    return val.tenantId === tenantId ? val : null;
  }

  async saveContact(contact: Contact): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(contact.tenantId)}/contacts/${safeKey(contact.contactId)}`).set(contact);
  }

  async saveRights(rights: RightsRecord): Promise<void> {
    const database = await db();
    await database.ref(`${tenantRoot(rights.tenantId)}/rightsByContact/${safeKey(rights.contactId)}`).set(rights);
  }
}
