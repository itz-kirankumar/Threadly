// Contact verification (PRD F05). The five states stay distinct and
// first-send eligibility fails closed (policy.ts). This module provides the
// only FREE verification signal available locally: domain MX resolution.
// Honesty boundary: MX existence proves the domain accepts mail, never that
// the mailbox exists - so this adapter can only DOWNGRADE to "invalid"
// (domain cannot receive mail) or record that a check happened while the
// state stays "unknown". It can never set "valid" or "catch_all": those
// require a real mailbox-verification provider, which is a paid owner
// decision and remains unexercised.

import type { Contact, ISODate } from "./types.ts";

export interface VerificationOutcome {
  state: "invalid" | "unknown";
  detail: string;
}

export interface VerificationAdapter {
  verifier: string; // recorded on the contact
  verify(email: string): Promise<VerificationOutcome>;
}

export interface MxResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
}

export class NodeMxResolver implements MxResolver {
  async resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]> {
    const { promises: dns } = await import("node:dns");
    try {
      return await dns.resolveMx(domain);
    } catch {
      return []; // NXDOMAIN/ENOTFOUND/timeout all read as "no MX"
    }
  }
}

export class MxVerifier implements VerificationAdapter {
  verifier = "mx-check";
  private resolver: MxResolver;
  constructor(resolver: MxResolver) {
    this.resolver = resolver;
  }
  async verify(email: string): Promise<VerificationOutcome> {
    const domain = email.trim().toLowerCase().split("@")[1] ?? "";
    if (!domain) return { state: "invalid", detail: "malformed email: no domain" };
    const mx = await this.resolver.resolveMx(domain);
    if (mx.length === 0) {
      return { state: "invalid", detail: `no MX record for ${domain}; domain cannot receive mail` };
    }
    // MX exists: the domain accepts mail. The mailbox itself is unproven.
    return { state: "unknown", detail: `MX present for ${domain} (${mx.length} record(s)); mailbox existence unproven` };
  }
}

// Applies an outcome to a contact's verification block. A downgrade to
// invalid always lands; an inconclusive result NEVER upgrades a stronger
// existing negative state (stale/catch_all/invalid survive a later MX pass)
// and only refreshes the timestamp on states the check actually speaks to.
export function applyVerificationOutcome(
  contact: Contact,
  outcome: VerificationOutcome,
  verifier: string,
  now: Date,
): Contact {
  const verifiedAt: ISODate = now.toISOString();
  if (outcome.state === "invalid") {
    return { ...contact, verification: { state: "invalid", verifiedAt, verifier } };
  }
  // Inconclusive (MX present): never upgrade invalid/catch_all; refresh
  // the check timestamp but keep the strongest known state.
  const keep = contact.verification.state === "invalid" || contact.verification.state === "catch_all" || contact.verification.state === "stale"
    ? contact.verification.state
    : "unknown";
  return { ...contact, verification: { state: keep, verifiedAt, verifier } };
}
