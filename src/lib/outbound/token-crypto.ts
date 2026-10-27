// AES-256-GCM encryption for OAuth tokens at rest. The key comes from the
// OUTBOUND_TOKEN_KEY environment variable (64 hex chars = 32 bytes) and never
// appears in records, logs or responses. If the key is absent, encryption
// refuses rather than storing tokens in the clear.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const raw = process.env.OUTBOUND_TOKEN_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("OUTBOUND_TOKEN_KEY is not configured (expected 64 hex characters); refusing to store tokens unencrypted");
  }
  return Buffer.from(raw, "hex");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), ciphertext.toString("base64"), tag.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("unrecognized token blob format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1], "base64"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64")), decipher.final()]).toString("utf8");
}

export function hmacHex(value: string): string {
  return createHmac("sha256", key()).update(value, "utf8").digest("hex");
}

export function hmacEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
