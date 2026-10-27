// Opt-out transport (PRD F14): every outbound body carries a visible
// unsubscribe link, and every send carries List-Unsubscribe +
// List-Unsubscribe-Post (RFC 8058 one-click) headers. The link URL is an
// HMAC capability: no session needed, but tampering with tenant, email or
// campaign invalidates it. Missing configuration fails CLOSED at draft
// render (no draft without a working opt-out path) and at dispatch (a draft
// rendered before this existed has no stored URL and defers).
//
// The unsubscribe line is appended at RENDER time so the reviewer approves
// the exact final body (F08: dispatch content matches approved content).
//
// GET on the link performs NO state change (scanners prefetch links); it
// renders a confirmation page whose form POSTs. POST (the form, or an RFC
// 8058 receiver's one-click POST) creates the suppression.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface UnsubscribeConfig {
  baseUrl: string; // e.g. https://www.gothreadly.live - no trailing slash
  secret: string;
}

export function unsubscribeConfigFromEnv(): UnsubscribeConfig | null {
  const baseUrl = process.env.OUTBOUND_PUBLIC_BASE_URL;
  const secret = process.env.OUTBOUND_UNSUBSCRIBE_SECRET;
  if (!baseUrl || !secret) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function fromB64(s: string): string | null {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function sign(secret: string, tenantId: string, email: string, campaignId: string): string {
  return createHmac("sha256", secret).update(`${tenantId}|${email.toLowerCase()}|${campaignId}`).digest("hex").slice(0, 32);
}

export function buildUnsubscribeUrl(
  cfg: UnsubscribeConfig,
  input: { tenantId: string; email: string; campaignId: string }
): string {
  const email = input.email.trim().toLowerCase();
  const sig = sign(cfg.secret, input.tenantId, email, input.campaignId);
  return `${cfg.baseUrl}/api/outbound/unsubscribe?t=${encodeURIComponent(input.tenantId)}&e=${encodeURIComponent(b64url(email))}&c=${encodeURIComponent(input.campaignId)}&sig=${sig}`;
}

export function verifyUnsubscribeParams(
  cfg: UnsubscribeConfig,
  params: { t?: string | null; e?: string | null; c?: string | null; sig?: string | null }
): { tenantId: string; email: string; campaignId: string } | null {
  const { t, e, c, sig } = params;
  if (!t || !e || !c || !sig) return null;
  const email = fromB64(e);
  if (!email || !email.includes("@")) return null;
  const expected = sign(cfg.secret, t, email, c);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { tenantId: t, email, campaignId: c };
}

export function unsubscribeFooter(url: string): string {
  return `\n\n--\nUnsubscribe: ${url}`;
}

// Headers for RFC 8058 one-click. The URL is the same capability link.
export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
