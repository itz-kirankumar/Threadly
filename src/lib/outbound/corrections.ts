// F03 corrections: subsidiary/shared-domain fixes. Two operator acts:
//  1. Domain assignment: an explicit tenant mapping domain -> account,
//     consulted by import BEFORE the domain index or auto-create. Use it
//     when a subsidiary must not collapse into the parent (or vice versa).
//  2. Contact reassignment: move a misassigned contact to another existing
//     account. A correction is NOT an employer change: employerChangedAt
//     stays untouched (that flag invalidates the record for first-send and
//     must keep its single meaning). Every correction writes linked
//     SourceEvidence (sourceName "operator_correction") and is audited by
//     the caller.

import type { Account, Contact, SourceEvidence } from "./types.ts";

export interface DomainAssignmentStore {
  getAssignment(tenantId: string, domain: string): Promise<string | null>; // accountId
  saveAssignment(tenantId: string, domain: string, accountId: string): Promise<void>;
}

export class MemoryDomainAssignmentStore implements DomainAssignmentStore {
  assignments = new Map<string, string>();
  async getAssignment(tenantId: string, domain: string): Promise<string | null> {
    return this.assignments.get(`${tenantId}:${domain.trim().toLowerCase()}`) ?? null;
  }
  async saveAssignment(tenantId: string, domain: string, accountId: string): Promise<void> {
    this.assignments.set(`${tenantId}:${domain.trim().toLowerCase()}`, accountId);
  }
}

export interface CorrectionStores {
  contacts: {
    getContact(tenantId: string, contactId: string): Promise<Contact | null>;
    saveContact(c: Contact): Promise<void>;
  };
  accounts: { getAccount(tenantId: string, accountId: string): Promise<Account | null> };
  evidence: { saveEvidence(e: SourceEvidence): Promise<void> };
}

export async function reassignContactToAccount(
  stores: CorrectionStores,
  input: {
    tenantId: string;
    contactId: string;
    targetAccountId: string;
    reason: string;
    actor: string;
    now: Date;
  },
): Promise<{ contact: Contact; evidenceId: string }> {
  const contact = await stores.contacts.getContact(input.tenantId, input.contactId);
  if (!contact) throw new Error("contact not found");
  const target = await stores.accounts.getAccount(input.tenantId, input.targetAccountId);
  if (!target) throw new Error("target account not found");
  if (contact.accountId === input.targetAccountId) throw new Error("contact already belongs to this account");
  const nowISO = input.now.toISOString();
  const updated: Contact = { ...contact, accountId: input.targetAccountId };
  await stores.contacts.saveContact(updated);
  const evidenceId = `ev_${crypto.randomUUID()}`;
  await stores.evidence.saveEvidence({
    tenantId: input.tenantId,
    evidenceId,
    contactId: contact.contactId,
    accountId: input.targetAccountId,
    kind: "signal",
    sourceName: "operator_correction",
    acquiredAt: nowISO,
    observedAt: nowISO,
    inference: `account correction from ${contact.accountId}: ${input.reason.slice(0, 300)}`,
    uncertainty: "fact",
    createdAt: nowISO,
    createdBy: input.actor,
  });
  return { contact: updated, evidenceId };
}
