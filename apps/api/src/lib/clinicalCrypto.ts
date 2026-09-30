import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { env } from "./env.js";

// Separate derivation domains from OAuth encryption; keep AUTH_SECRET stable.
// A dedicated key is supported. Rotation requires re-encrypting existing records.
const secret = process.env.CLINICAL_DATA_KEY || env.authSecret;
const key = createHash("sha256").update(`nexus-clinical-v1:${secret}`).digest();
export function encryptClinical(value: unknown, scope: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(scope));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    body.toString("base64"),
  ].join(".");
}
export function decryptClinical<T>(value: string, scope: string): T {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body)
    throw new Error("Invalid clinical ciphertext");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from(scope));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(body, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  ) as T;
}
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function clinicalHash(value: string, userId: string): string {
  return createHmac("sha256", key)
    .update(`${userId}:${normalize(value)}`)
    .digest("hex");
}
export function searchTokens(
  name: string,
  document: string,
  userId: string,
): string[] {
  const tokens = new Set<string>();
  for (const word of normalize(`${name} ${document}`).split(" ")) {
    for (let length = 2; length <= word.length; length++)
      tokens.add(clinicalHash(word.slice(0, length), userId));
  }
  return [...tokens];
}
export function queryTokens(query: string, userId: string): string[] {
  return normalize(query)
    .split(" ")
    .filter((v) => v.length >= 2)
    .map((v) => clinicalHash(v, userId));
}
