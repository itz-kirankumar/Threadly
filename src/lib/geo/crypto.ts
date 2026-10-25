import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM envelope encryption for user-supplied provider API keys.
// The plaintext never leaves the server; the database stores only ciphertext.

function masterKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("Key encryption is not configured on this deployment.");
  return createHash("sha256").update(secret).digest();
}

export function keyEncryptionReady(): boolean {
  return Boolean(process.env.KEY_ENCRYPTION_SECRET);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function lastFour(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.slice(-4);
}
