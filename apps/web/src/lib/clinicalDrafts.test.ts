import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import {
  acquireClinicalDraftLock,
  listClinicalDrafts,
  readClinicalDraft,
  removeClinicalDraft,
  saveClinicalDraft,
} from "./clinicalDrafts";
vi.stubGlobal("indexedDB", indexedDB);
vi.stubGlobal("crypto", webcrypto);
afterEach(() => vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal("indexedDB", indexedDB);
  vi.stubGlobal("crypto", webcrypto);
}
describe("encrypted clinical drafts", () => {
  it("keeps concurrent drafts independent, recoverable and scoped to each owner", async () => {
    setup();
    await saveClinicalDraft("doctor-1", "patient-1:draft-a", {
      fields: { reason: "Alergia A" },
    });
    await saveClinicalDraft("doctor-1", "patient-1:draft-b", {
      fields: { reason: "Control B" },
    });
    await saveClinicalDraft("doctor-2", "patient-1:draft-a", {
      fields: { reason: "Otra cuenta" },
    });
    expect(await readClinicalDraft("doctor-1", "patient-1:draft-a")).toEqual({
      fields: { reason: "Alergia A" },
    });
    expect(
      (await listClinicalDrafts("doctor-1", "patient-1"))
        .map((r) => r.slot)
        .sort(),
    ).toEqual(["patient-1:draft-a", "patient-1:draft-b"]);
    expect(await listClinicalDrafts("doctor-1", "patient-2")).toEqual([]);
    await removeClinicalDraft("doctor-1", "patient-1:draft-a");
    expect(await readClinicalDraft("doctor-1", "patient-1:draft-a")).toBeNull();
    expect(
      await readClinicalDraft("doctor-1", "patient-1:draft-b"),
    ).not.toBeNull();
    expect(
      await readClinicalDraft("doctor-2", "patient-1:draft-a"),
    ).not.toBeNull();
  });
  it("preserves legacy new-slot drafts and never writes clinical plaintext", async () => {
    setup();
    await saveClinicalDraft("legacy-owner", "patient-old:new", {
      secret: "PRIVATE CLINICAL TEXT",
    });
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("nexus_clinical_drafts", 1);
      req.onsuccess = () => resolve(req.result);
    });
    const row = await new Promise<{ iv: Uint8Array; data: ArrayBuffer }>(
      (resolve) => {
        const req = db
          .transaction("records")
          .objectStore("records")
          .get("draft:legacy-owner:patient-old:new");
        req.onsuccess = () => resolve(req.result);
      },
    );
    expect(new TextDecoder().decode(row.data)).not.toContain(
      "PRIVATE CLINICAL TEXT",
    );
    await new Promise<void>((resolve) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(
        row,
        "draft:legacy-owner:patient-old:different",
      );
      tx.oncomplete = () => resolve();
    });
    db.close();
    await expect(
      readClinicalDraft("legacy-owner", "patient-old:different"),
    ).rejects.toThrow();
    expect(await readClinicalDraft("legacy-owner", "patient-old:new")).toEqual({
      secret: "PRIVATE CLINICAL TEXT",
    });
  });
  it("fails closed when safe cross-tab locking is unavailable", async () => {
    setup();
    vi.stubGlobal("navigator", {});
    expect((await acquireClinicalDraftLock("u", "slot")).writable).toBe(false);
  });
  it("holds an exclusive lock through encryption cleanup and never steals it", async () => {
    setup();
    const held = new Set<string>();
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: unknown,
          fn: (lock: object | null) => Promise<void>,
        ) => {
          if (held.has(name)) return fn(null);
          held.add(name);
          try {
            await fn({ name });
          } finally {
            held.delete(name);
          }
        },
      },
    });
    const first = await acquireClinicalDraftLock("u", "patient:draft");
    expect(first.writable).toBe(true);
    expect(
      (await acquireClinicalDraftLock("u", "patient:draft")).writable,
    ).toBe(false);
    const other = await acquireClinicalDraftLock("u", "patient:another");
    expect(other.writable).toBe(true);
    other.release();
    first.release();
    await Promise.resolve();
    await Promise.resolve();
    const next = await acquireClinicalDraftLock("u", "patient:draft");
    expect(next.writable).toBe(true);
    next.release();
  });
});
