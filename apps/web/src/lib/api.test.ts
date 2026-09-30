import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("session recovery", () => {
  it("refreshes an expired session once and retries the authenticated read", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await api.get("/clinical/patients")).toEqual({ ok: true });
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not repeat an uncertain write after a server error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Unknown outcome" }), {
          status: 502,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      api.post("/clinical/patients", { name: "Ficticio" }),
    ).rejects.toThrow("Unknown outcome");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
