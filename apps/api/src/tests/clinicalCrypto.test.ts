import { describe, expect, it } from "vitest";
import { encryptClinical, decryptClinical } from "../lib/clinicalCrypto.js";
describe("clinical encryption", () => {
  it("binds ciphertext to its owner and record, and uses random IVs", () => {
    const a = encryptClinical({ name: "Ficticio" }, "owner:patient:1"),
      b = encryptClinical({ name: "Ficticio" }, "owner:patient:1");
    expect(a).not.toBe(b);
    expect(decryptClinical(a, "owner:patient:1")).toEqual({ name: "Ficticio" });
    expect(() => decryptClinical(a, "other:patient:1")).toThrow();
    expect(() => decryptClinical(a, "owner:patient:2")).toThrow();
  });
});
