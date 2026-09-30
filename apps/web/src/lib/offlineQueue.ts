"use client";
import { api } from "./api";
const STORAGE_PREFIX = "nexus_offline_captures_v2:";
interface QueuedCapture {
  id: string;
  rawText: string;
  source: "TEXT" | "VOICE";
  queuedAt: string;
}
const locks = new Map<string, Promise<{ sent: number; remaining: number }>>();
function readQueue(userId: string): QueuedCapture[] {
  const raw = localStorage.getItem(STORAGE_PREFIX + userId);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed))
    throw new Error(
      "La cola local no pudo leerse; se conserva para recuperación",
    );
  return parsed as QueuedCapture[];
}
function writeQueue(userId: string, queue: QueuedCapture[]) {
  localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(queue));
  window.dispatchEvent(new Event("nexus-offline-queue"));
}
export function queueCapture(
  rawText: string,
  source: "TEXT" | "VOICE" = "TEXT",
  userId?: string,
): boolean {
  if (!userId) return false;
  try {
    const queue = readQueue(userId);
    queue.push({
      id: crypto.randomUUID(),
      rawText,
      source,
      queuedAt: new Date().toISOString(),
    });
    writeQueue(userId, queue);
    return true;
  } catch {
    return false;
  }
}
export function pendingCaptureCount(userId: string): number {
  try {
    return readQueue(userId).length;
  } catch {
    return -1;
  }
}
export function hasLegacyCaptures(): boolean {
  return Boolean(localStorage.getItem("nexus_offline_captures"));
}
// Only a user-initiated claim migrates legacy captures, whose owner is unknown.
export function claimLegacyCaptures(userId: string): boolean {
  try {
    const legacy = localStorage.getItem("nexus_offline_captures");
    if (!legacy) return true;
    const parsed = JSON.parse(legacy) as QueuedCapture[];
    if (!Array.isArray(parsed)) return false;
    const current = readQueue(userId),
      ids = new Set(current.map((item) => item.id));
    writeQueue(userId, [
      ...current,
      ...parsed.filter((item) => !ids.has(item.id)),
    ]);
    localStorage.removeItem("nexus_offline_captures");
    return true;
  } catch {
    return false;
  }
}
export function flushOfflineQueue(
  userId: string,
): Promise<{ sent: number; remaining: number }> {
  const running = locks.get(userId);
  if (running) return running;
  const task = (async () => {
    let queue: QueuedCapture[];
    try {
      queue = readQueue(userId);
    } catch {
      return { sent: 0, remaining: -1 };
    }
    const sentIds = new Set<string>();
    for (const item of queue) {
      try {
        await api.post("/quick-capture", {
          rawText: item.rawText,
          source: item.source,
          captureId: item.id,
          expectedOwnerId: userId,
        });
        sentIds.add(item.id);
      } catch {
        break;
      } // Includes 401, validation and network errors. Never discard unsent text.
    }
    try {
      // Read again so a capture added during a request cannot be overwritten.
      const remaining = readQueue(userId).filter(
        (item) => !sentIds.has(item.id),
      );
      writeQueue(userId, remaining);
      return { sent: sentIds.size, remaining: remaining.length };
    } catch {
      return { sent: sentIds.size, remaining: -1 };
    }
  })().finally(() => locks.delete(userId));
  locks.set(userId, task);
  return task;
}
