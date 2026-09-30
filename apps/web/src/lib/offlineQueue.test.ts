import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
const post = vi.hoisted(() => vi.fn());
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  api: { post },
}));
import {
  queueCapture,
  flushOfflineQueue,
  pendingCaptureCount,
} from "./offlineQueue";
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) || null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  post.mockReset();
});
describe("offline capture reliability", () => {
  it("keeps text when authentication expires and never moves it to another user", async () => {
    expect(queueCapture("Nota", "TEXT", "a")).toBe(true);
    post.mockRejectedValue(new ApiError(401, "Expired"));
    expect((await flushOfflineQueue("a")).remaining).toBe(1);
    await flushOfflineQueue("b");
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("reports storage failure instead of pretending a note was saved", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("Full");
      },
    });
    expect(queueCapture("Nota", "TEXT", "a")).toBe(false);
  });
  it("serializes flushes and preserves new captures added during an upload", async () => {
    queueCapture("Primera", "TEXT", "a");
    let resolve: () => void = () => {};
    post.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const one = flushOfflineQueue("a"),
      two = flushOfflineQueue("a");
    queueCapture("Segunda", "TEXT", "a");
    resolve();
    await Promise.all([one, two]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(pendingCaptureCount("a")).toBe(1);
    expect(post.mock.calls[0]?.[1].captureId).toBeTruthy();
  });
});
