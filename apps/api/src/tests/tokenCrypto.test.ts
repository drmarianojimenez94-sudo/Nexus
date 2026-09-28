import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "../lib/tokenCrypto.js";

describe("tokenCrypto", () => {
  it("round-trips a plaintext token", () => {
    const plaintext = "ya29.a0AfH6SMB_fake_google_access_token";
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "same-token-both-times";
    expect(encryptToken(plaintext)).not.toBe(encryptToken(plaintext));
  });
});
