import { afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  $executeRawUnsafe: vi.fn(),
  integration: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: db }));
import {
  draftRaw,
  googleRequest,
  googleJSON,
  limitedText,
  sendConfirmation,
  verifyConfirmation,
  workspaceToken,
} from "../lib/googleWorkspace.js";
import { encryptToken } from "../lib/tokenCrypto.js";
import { GOOGLE_SCOPES } from "../lib/googleCalendar.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Google workspace provider guards", () => {
  it("binds reviewed content to owner/draft and expiration", () => {
    const token = sendConfirmation("owner", "draft", "raw");
    expect(() =>
      verifyConfirmation(token, "owner", "draft", "raw"),
    ).not.toThrow();
    for (const [owner, id, raw] of [
      ["other", "draft", "raw"],
      ["owner", "other", "raw"],
      ["owner", "draft", "changed"],
    ])
      expect(() => verifyConfirmation(token, owner!, id!, raw!)).toThrow();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600001);
    expect(() => verifyConfirmation(token, "owner", "draft", "raw")).toThrow();
  });
  it("creates UTF-8 MIME while separating headers from user content", () => {
    const raw = Buffer.from(
      draftRaw({
        to: "doctor@example.test",
        subject: "Reunión clínica",
        body: "Contenido\nCc: no-header@example.test",
      }),
      "base64url",
    ).toString();
    expect(raw).toContain("To: doctor@example.test\r\n");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).not.toContain("Cc: no-header");
  });
  it("limits downloads and sanitizes malformed provider JSON", async () => {
    expect(await limitedText(new Response("abcdef"), 3)).toEqual({
      text: "abc",
      truncated: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private content not JSON")),
    );
    await expect(
      googleJSON("token", "https://www.googleapis.com/drive/v3/files"),
    ).rejects.toThrow("respuesta inválida");
  });
  it("does not retry uncertain sends or expose provider errors", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error("secret provider response"));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      googleRequest(
        "token",
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
        { method: "POST" },
      ),
    ).rejects.toThrow("revisá Enviados");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response("private token", { status: 403 }));
    await expect(
      googleRequest("token", "https://www.googleapis.com/drive/v3/files"),
    ).rejects.toThrow("Google rechazó");
  });
  it("refreshes once for concurrent reads and preserves encrypted storage", async () => {
    db.integration.findUnique.mockResolvedValue({
      id: "integration",
      accessToken: encryptToken("old"),
      refreshToken: encryptToken("refresh"),
      expiresAt: new Date(0),
      status: "CONNECTED",
      scopes: GOOGLE_SCOPES.gmailRead,
    });
    db.integration.updateMany.mockResolvedValue({ count: 1 });
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: "new", expires_in: 3600 })),
      );
    vi.stubGlobal("fetch", fetcher);
    const results = await Promise.all([
      workspaceToken("owner", GOOGLE_SCOPES.gmailRead),
      workspaceToken("owner", GOOGLE_SCOPES.gmailRead),
    ]);
    expect(results).toEqual(["new", "new"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const update = db.integration.updateMany.mock.calls.at(-1)![0];
    expect(update.where.userId).toBe("owner");
    expect(update.data.accessToken).not.toBe("new");
  });
});
