import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setApiSessionOwner } from "./api";
afterEach(() => {
  vi.unstubAllGlobals();
  setApiSessionOwner(null);
});
describe("session recovery", () => {
  it("refreshes an expired session once and retries the authenticated read", async () => {
    setApiSessionOwner("account-a");
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
    setApiSessionOwner("account-a");
    const fetcher = vi.fn().mockResolvedValue(
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
  it("keeps the original clinical owner across an authentication retry", async () => {
    setApiSessionOwner("account-a");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(async () => {
        setApiSessionOwner("account-b");
        return new Response(null, { status: 204 });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "La cuenta cambió" }), {
          status: 409,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(api.post("/clinical/patients", { name: "A" })).rejects.toThrow(
      "La cuenta cambió",
    );
    expect(fetcher.mock.calls[2]?.[1].headers["X-Nexus-Owner"]).toBe(
      "account-a",
    );
  });
  it("does not send clinical data when the session owner is unknown", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(api.post("/clinical/patients", { name: "A" })).rejects.toThrow(
      "Volvé a ingresar",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
