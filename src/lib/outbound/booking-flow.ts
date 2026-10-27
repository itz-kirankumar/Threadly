// Booking flow: policy management, recipient booking links and slot
// selection. Links are public but the stored token is a sha256 hash only.
// Every commit rechecks free/busy (commitBooking) and a scheduling
// suggestion never creates an invite: only an explicit recipient slot
// selection or rep action commits.

import { createHash, randomBytes } from "node:crypto";
import { commitBooking, computeSlots } from "./booking.ts";
import type { CalendarAdapter } from "./providers/calendar.ts";
import type { BookingLink, BookingPolicy, Contact, Meeting, Sender } from "./types.ts";
import type { ConversationStore } from "./conversations.ts";
import { auditEvent, type AuditStore } from "./audit.ts";

export interface BookingPolicyStore {
  savePolicy(p: BookingPolicy): Promise<void>;
  getPolicy(tenantId: string, policyId: string): Promise<BookingPolicy | null>;
  listPolicies(tenantId: string): Promise<BookingPolicy[]>;
}

export interface BookingLinkStore {
  saveLink(l: BookingLink): Promise<void>;
  getLinkByTokenHash(tokenHash: string): Promise<BookingLink | null>;
  updateLink(l: BookingLink): Promise<void>;
  // Atomic claim: succeeds only when the link is unused and unclaimed. This
  // is the concurrency lock that makes double redemption (and therefore
  // duplicate provider events) impossible; a free/busy recheck alone is not.
  claimLink(l: BookingLink): Promise<boolean>;
  // Release after a failure where NO provider call happened (e.g. slot
  // conflict at the commit-time recheck). The link becomes usable again.
  releaseLinkClaim(l: BookingLink): Promise<void>;
  // Mark after a provider call whose outcome is unknown: never retried
  // automatically; requires reconciliation, like provider_unknown sends.
  markClaimUnknown(l: BookingLink, claimError?: string): Promise<void>;
  listLinks(tenantId: string): Promise<BookingLink[]>;
}

export interface BookingStores {
  policies: BookingPolicyStore;
  links: BookingLinkStore;
  conversations: ConversationStore;
  contacts: { getContact(tenantId: string, contactId: string): Promise<Contact | null> };
  senders: { getSender(tenantId: string, senderId: string): Promise<Sender | null> };
}

export function hashBookingToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createBookingLink(
  stores: BookingStores,
  input: {
    tenantId: string;
    conversationId: string | null;
    contactId: string;
    organizerSenderId: string;
    policyId: string;
    actor: string;
    ttlDays?: number;
  }
): Promise<{ ok: true; token: string; bookingLinkId: string; expiresAt: string } | { ok: false; status: number; error: string }> {
  const policy = await stores.policies.getPolicy(input.tenantId, input.policyId);
  if (!policy) return { ok: false, status: 404, error: "Booking policy not found." };
  if (!policy.hostPool.includes(input.organizerSenderId)) {
    return { ok: false, status: 400, error: "Organizer is not in the policy host pool." };
  }
  const contact = await stores.contacts.getContact(input.tenantId, input.contactId);
  if (!contact) return { ok: false, status: 404, error: "Contact not found." };
  const sender = await stores.senders.getSender(input.tenantId, input.organizerSenderId);
  if (!sender) return { ok: false, status: 404, error: "Organizer sender not found." };
  const token = `bok_${randomBytes(24).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlDays ?? 14) * 24 * 60 * 60 * 1000).toISOString();
  const link: BookingLink = {
    tenantId: input.tenantId,
    bookingLinkId: `bkl_${crypto.randomUUID()}`,
    tokenHash: hashBookingToken(token),
    conversationId: input.conversationId,
    contactId: input.contactId,
    organizerSenderId: input.organizerSenderId,
    policyId: input.policyId,
    expiresAt,
    usedAt: null,
    meetingId: null,
    claimState: null,
    createdAt: now.toISOString(),
    createdBy: input.actor,
  };
  await stores.links.saveLink(link);
  return { ok: true, token, bookingLinkId: link.bookingLinkId, expiresAt };
}

export interface CalendarRuntime {
  adapter: CalendarAdapter;
  accessToken: string | null;
}

async function loadLink(stores: BookingStores, token: string): Promise<BookingLink | null> {
  if (!/^bok_[0-9a-f]{48}$/.test(token)) return null;
  return stores.links.getLinkByTokenHash(hashBookingToken(token));
}

export async function getBookingOffer(
  stores: BookingStores,
  calendar: CalendarRuntime,
  token: string,
  now: Date
): Promise<
  | { ok: true; organizerEmail: string; durationMinutes: number; timezone: string; expiresAt: string; slots: { startISO: string; endISO: string }[] }
  | { ok: false; status: number; error: string }
> {
  const link = await loadLink(stores, token);
  if (!link) return { ok: false, status: 404, error: "Booking link not found." };
  if (link.usedAt) return { ok: false, status: 410, error: "This booking link has already been used." };
  if (Date.parse(link.expiresAt) < now.getTime()) return { ok: false, status: 410, error: "This booking link has expired." };
  const policy = await stores.policies.getPolicy(link.tenantId, link.policyId);
  const sender = await stores.senders.getSender(link.tenantId, link.organizerSenderId);
  if (!policy || !sender) return { ok: false, status: 404, error: "Booking configuration missing." };
  const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const busy = await calendar.adapter.getFreeBusy({ accessToken: calendar.accessToken, windowStartISO: now.toISOString(), windowEndISO: windowEnd });
  const slots = computeSlots(policy, busy, now, 14);
  return {
    ok: true,
    organizerEmail: sender.email,
    durationMinutes: policy.durationMinutes,
    timezone: policy.workingHours.timezone,
    expiresAt: link.expiresAt,
    slots,
  };
}

export async function selectSlot(
  stores: BookingStores,
  calendar: CalendarRuntime,
  input: { token: string; startISO: string; actor: string; now: Date; audit?: AuditStore }
): Promise<{ ok: true; meeting: Meeting; synthetic: boolean } | { ok: false; status: number; error: string }> {
  const link = await loadLink(stores, input.token);
  if (!link) return { ok: false, status: 404, error: "Booking link not found." };
  if (link.usedAt) return { ok: false, status: 410, error: "This booking link has already been used." };
  if (Date.parse(link.expiresAt) < input.now.getTime()) return { ok: false, status: 410, error: "This booking link has expired." };
  const policy = await stores.policies.getPolicy(link.tenantId, link.policyId);
  const contact = await stores.contacts.getContact(link.tenantId, link.contactId);
  if (!policy || !contact) return { ok: false, status: 404, error: "Booking configuration missing." };
  // The chosen start must be a currently valid slot: arbitrary times are
  // rejected before any provider call.
  const windowEnd = new Date(input.now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const busy = await calendar.adapter.getFreeBusy({ accessToken: calendar.accessToken, windowStartISO: input.now.toISOString(), windowEndISO: windowEnd });
  const valid = computeSlots(policy, busy, input.now, 14).some((s) => s.startISO === new Date(input.startISO).toISOString());
  if (!valid) return { ok: false, status: 409, error: "Selected start is not an available slot." };
  // Atomic claim BEFORE the provider call: simultaneous redemptions cannot
  // both reach event creation. Exactly one provider attempt per link, ever.
  const claimed = await stores.links.claimLink(link);
  if (!claimed) return { ok: false, status: 409, error: "booking_in_progress_or_used: this link is being or has been redeemed." };
  let committed;
  try {
    // Second recheck happens inside commitBooking immediately before creation.
    committed = await commitBooking(calendar.adapter, calendar.accessToken, {
      tenantId: link.tenantId,
      policy,
      conversationId: link.conversationId,
      contactId: link.contactId,
      contactEmail: contact.email,
      organizerSenderId: link.organizerSenderId,
      startISO: input.startISO,
      actor: input.actor,
    });
    if (!committed.ok) {
      // Conflict found before the provider call: no event attempt happened, so
      // the claim is safely released for another slot choice.
      await stores.links.releaseLinkClaim(link);
      return { ok: false, status: 409, error: committed.error };
    }
    await stores.conversations.saveMeeting(committed.meeting);
    await stores.links.updateLink({ ...link, usedAt: new Date().toISOString(), meetingId: committed.meeting.meetingId, claimState: "claimed" });
  } catch (error) {
    // Anything after a successful claim is uncertain: a provider event may or
    // may not exist. Quarantine the link, log for reconciliation, never
    // blind-retry, and never leave the link stuck in "claiming".
    console.error("booking commit failed after claim; quarantined", error instanceof Error ? { name: error.name, message: error.message } : error);
    const claimError = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown error";
    await stores.links.markClaimUnknown(link, claimError);
    return { ok: false, status: 502, error: "provider_outcome_unknown: the calendar call outcome is uncertain; reconciliation is required and no automatic retry will happen (duplicate-invite risk is not taken)." };
  }
  // Audit failure must not fail a committed booking; the meeting record is
  // the source of truth and the error is logged for investigation.
  try {
    await input.audit?.append(auditEvent({
      tenantId: link.tenantId, actor: input.actor, action: "booking.committed",
      target: `meeting:${committed.meeting.meetingId}`, outcome: "success",
      detail: committed.synthetic ? "synthetic (mock calendar)" : "provider-confirmed",
    }));
  } catch (error) {
    console.error("booking audit append failed after commit", error instanceof Error ? { name: error.name, message: error.message } : error);
  }
  return { ok: true, meeting: committed.meeting, synthetic: committed.synthetic };
}

export async function cancelMeeting(
  stores: BookingStores,
  calendar: CalendarRuntime,
  input: { tenantId: string; meetingId: string; actor: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const meeting = await stores.conversations.getMeeting(input.tenantId, input.meetingId);
  if (!meeting) return { ok: false, status: 404, error: "Meeting not found." };
  if (meeting.cancelledAt) return { ok: false, status: 409, error: "Meeting already cancelled." };
  if (meeting.providerEventId) {
    await calendar.adapter.cancelEvent({ accessToken: calendar.accessToken, providerEventId: meeting.providerEventId });
  }
  await stores.conversations.saveMeeting({ ...meeting, cancelledAt: new Date().toISOString() });
  return { ok: true };
}
