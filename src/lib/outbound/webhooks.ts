// Webhook verification + parsing (PRD F15 transport). All verification is
// fail-closed: a missing/ mismatched secret or an unbound mailbox means the
// notification is ignored with no side effects. These routes carry no send
// capability; they only record that an inbound sync is warranted.

import { createHash, timingSafeEqual } from "node:crypto";

export function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface GmailPushEnvelope {
  message?: { data?: string; messageId?: string };
  subscription?: string;
}

export interface ParsedGmailNotification {
  emailAddress: string;
  historyId: string;
}

// Pub/Sub push envelope: message.data is base64url JSON
// {"emailAddress":"...","historyId":...}. Any malformed shape is null.
export function parseGmailPush(body: unknown): ParsedGmailNotification | null {
  if (typeof body !== "object" || body === null) return null;
  const env = body as GmailPushEnvelope;
  const data = env.message?.data;
  if (typeof data !== "string" || !data) return null;
  try {
    const decoded = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Record<string, unknown>;
    const emailAddress = typeof decoded.emailAddress === "string" ? decoded.emailAddress : null;
    const historyId = typeof decoded.historyId === "string" || typeof decoded.historyId === "number" ? String(decoded.historyId) : null;
    if (!emailAddress || !historyId) return null;
    return { emailAddress, historyId };
  } catch {
    return null;
  }
}

export interface GraphNotification {
  value?: { subscriptionId?: string; clientState?: string; resource?: string; changeType?: string }[];
}

// Microsoft Graph change notifications carry clientState per notification;
// the caller compares each against the configured secret. Returns the
// resource strings only when every entry verifies (fail closed on any miss).
export function parseGraphNotifications(body: unknown, expectedClientState: string): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const val = (body as GraphNotification).value;
  if (!Array.isArray(val) || val.length === 0) return null;
  const resources: string[] = [];
  for (const n of val) {
    if (typeof n?.clientState !== "string" || !secretMatches(n.clientState, expectedClientState)) return null;
    if (typeof n?.resource === "string") resources.push(n.resource);
  }
  return resources;
}

export function eventKeyHash(parts: string): string {
  return createHash("sha256").update(parts).digest("hex").slice(0, 40);
}
