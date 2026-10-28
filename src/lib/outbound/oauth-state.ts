// HMAC-signed OAuth state parameter. Binds a consent session to a tenant +
// sender with an expiry, so a callback cannot be replayed across senders or
// after the window closes. Uses OUTBOUND_OAUTH_STATE_KEY as the HMAC key.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface StatePayload {
  tenantId: string;
  // Empty string marks consent-first ("Connect Google"): no sender is
  // registered yet; the callback auto-registers from the consented account.
  senderId: string;
  purpose?: "send" | "calendar";
  provider?: "gmail" | "microsoft";
  nonce: string;
  exp: number; // epoch ms
}

function stateKey(): string {
  const raw = process.env.OUTBOUND_OAUTH_STATE_KEY;
  if (!raw || raw.length < 16) {
    throw new Error("OUTBOUND_OAUTH_STATE_KEY is not configured (min 16 chars); consent flow unavailable");
  }
  return raw;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", stateKey()).update(payloadB64, "utf8").digest("hex");
}

export function createOAuthState(input: { tenantId: string; senderId: string; purpose?: "send" | "calendar"; provider?: "gmail" | "microsoft"; ttlMs?: number }): { state: string; expiresAt: string } {
  const ttl = input.ttlMs ?? 10 * 60 * 1000;
  const payload: StatePayload = {
    tenantId: input.tenantId,
    senderId: input.senderId,
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + ttl,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return { state: `${payloadB64}.${sign(payloadB64)}`, expiresAt: new Date(payload.exp).toISOString() };
}

export function verifyOAuthState(state: string): { tenantId: string; senderId: string; purpose: "send" | "calendar"; provider: "gmail" | "microsoft" | null; nonce: string } {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) throw new Error("malformed oauth state");
  const payloadB64 = state.slice(0, dot);
  const presented = Buffer.from(state.slice(dot + 1), "utf8");
  const expected = Buffer.from(sign(payloadB64), "utf8");
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw new Error("invalid oauth state signature");
  }
  const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")) as StatePayload;
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    throw new Error("expired oauth state");
  }
  if (typeof payload.tenantId !== "string" || payload.tenantId.length === 0) throw new Error("malformed oauth state");
  if (typeof payload.senderId !== "string") throw new Error("malformed oauth state");
  if (typeof payload.nonce !== "string" || payload.nonce.length === 0) throw new Error("malformed oauth state");
  const provider = payload.provider === "gmail" || payload.provider === "microsoft" ? payload.provider : null;
  return { tenantId: payload.tenantId, senderId: payload.senderId, purpose: payload.purpose === "calendar" ? "calendar" : "send", provider, nonce: payload.nonce };
}
