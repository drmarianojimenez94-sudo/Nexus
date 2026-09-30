"use client";

// Persistent encrypted drafts; no clinical text goes into localStorage.
// Non-extractable per-user keys and ciphertext live in IndexedDB. This protects
// storage dumps, not a compromised browser/XSS. Use trusted devices only.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nexus_clinical_drafts", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("records");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error("No se pudo abrir el almacenamiento de borradores"));
  });
}
async function get<T>(id: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction("records", "readonly");
      const req = tx.objectStore("records").get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
async function put(id: string, value: unknown, remove = false) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      if (remove) tx.objectStore("records").delete(id);
      else tx.objectStore("records").put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
const keyPromises = new Map<string, Promise<CryptoKey>>();
function keyFor(userId: string): Promise<CryptoKey> {
  if (!keyPromises.has(userId))
    keyPromises.set(
      userId,
      (async () => {
        const existing = await get<CryptoKey>(`key:${userId}`);
        if (existing) return existing;
        const key = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        );
        // The read and possible write share one transaction; another tab cannot
        // replace the key between them and make previously saved drafts unreadable.
        const db = await openDb();
        try {
          return await new Promise<CryptoKey>((resolve, reject) => {
            const tx = db.transaction("records", "readwrite"),
              store = tx.objectStore("records");
            const req = store.get(`key:${userId}`);
            let selected = key;
            req.onsuccess = () => {
              if (req.result) selected = req.result as CryptoKey;
              else store.put(key, `key:${userId}`);
            };
            tx.oncomplete = () => resolve(selected);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      })().catch((err) => {
        keyPromises.delete(userId);
        throw err;
      }),
    );
  return keyPromises.get(userId)!;
}
export async function saveClinicalDraft(
  userId: string,
  slot: string,
  value: unknown,
) {
  const key = await keyFor(userId),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(`${userId}:${slot}`),
    },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  await put(`draft:${userId}:${slot}`, { iv, data });
}
export async function readClinicalDraft<T>(
  userId: string,
  slot: string,
): Promise<T | null> {
  const row = await get<{ iv: Uint8Array; data: ArrayBuffer }>(
    `draft:${userId}:${slot}`,
  );
  if (!row) return null;
  const data = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: row.iv as Uint8Array<ArrayBuffer>,
      additionalData: new TextEncoder().encode(`${userId}:${slot}`),
    },
    await keyFor(userId),
    row.data,
  );
  return JSON.parse(new TextDecoder().decode(data)) as T;
}
export const removeClinicalDraft = (userId: string, slot: string) =>
  put(`draft:${userId}:${slot}`, undefined, true);

/** Enumerate only this account's encrypted records, decrypting metadata locally. */
export async function listClinicalDrafts<T>(userId: string, patientId: string) {
  const db = await openDb();
  let keys: IDBValidKey[];
  try {
    keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db
        .transaction("records", "readonly")
        .objectStore("records")
        .getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
  const prefix = `draft:${userId}:${patientId}:`;
  const rows = [];
  for (const key of keys) {
    if (typeof key !== "string" || !key.startsWith(prefix)) continue;
    const slot = key.slice(`draft:${userId}:`.length);
    const value = await readClinicalDraft<T>(userId, slot);
    if (value) rows.push({ slot, value });
  }
  return rows;
}

/** Hold the browser lock until the editor unmounts. Never steal an active lock. */
export async function acquireClinicalDraftLock(
  userId: string,
  slot: string,
): Promise<{
  writable: boolean;
  release: () => void;
}> {
  if (!navigator.locks) return { writable: false, release: () => {} };
  let release = () => {};
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(
        `nexus-clinical:${userId}:${slot}`,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) {
            resolve({ writable: false, release });
            return;
          }
          await new Promise<void>((done) => {
            release = done;
            resolve({ writable: true, release });
          });
        },
      )
      .catch(reject);
  });
}
