"use client";

import { api, ApiError } from "./api";

const STORAGE_KEY = "nexus_offline_captures";

interface QueuedCapture {
  id: string;
  rawText: string;
  source: "TEXT" | "VOICE";
  queuedAt: string;
}

/**
 * Quick Capture must never lose a thought just because the phone has no
 * signal (spec §51: capturar sin conexión). Simplest thing that actually
 * works: hold captures in localStorage when the request fails, and flush
 * them the moment connectivity comes back — no service worker, no
 * IndexedDB, nothing that needs its own debugging story.
 */
function readQueue(): QueuedCapture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedCapture[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedCapture[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable (private mode) — nothing more we can do.
  }
}

export function queueCapture(rawText: string, source: "TEXT" | "VOICE" = "TEXT") {
  const queue = readQueue();
  queue.push({ id: crypto.randomUUID(), rawText, source, queuedAt: new Date().toISOString() });
  writeQueue(queue);
}

export function pendingCaptureCount(): number {
  return readQueue().length;
}

/** Network vs. auth/validation errors need different handling — only the
 * former means "try again later", the latter would just fail forever. */
function isNetworkError(err: unknown): boolean {
  return !(err instanceof ApiError);
}

/** Sends every queued capture; keeps whatever still fails for next time. */
export async function flushOfflineQueue(): Promise<{ sent: number; remaining: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const stillQueued: QueuedCapture[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      await api.post("/quick-capture", { rawText: item.rawText, source: item.source });
      sent++;
    } catch (err) {
      if (isNetworkError(err)) {
        stillQueued.push(item);
      }
      // A validation/auth error means this item can never succeed — drop it
      // rather than retry forever.
    }
  }
  writeQueue(stillQueued);
  return { sent, remaining: stillQueued.length };
}
