import crypto from "node:crypto";
import { env } from "./env.js";

/**
 * Encrypts OAuth tokens at rest (spec §doc NEXUS_SECURITY.md — "cifrado de
 * tokens OAuth en reposo", called out since Fase 1 as required before the
 * first real token is stored). Deliberately reuses AUTH_SECRET instead of
 * asking for yet another environment variable to configure — one less
 * thing to get wrong when deploying, and it's already a private,
 * server-only secret with the right properties for deriving a key from.
 */
const KEY = crypto.createHash("sha256").update(env.authSecret).digest();
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptToken(ciphertext: string): string {
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
