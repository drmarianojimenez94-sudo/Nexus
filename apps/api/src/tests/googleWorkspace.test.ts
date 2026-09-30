import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { encryptToken, decryptToken } from "../lib/tokenCrypto.js";
import { GOOGLE_SCOPES, buildGoogleAuthUrl } from "../lib/googleCalendar.js";
import {
  draftRaw,
  limitedText,
  sendConfirmation,
  verifyConfirmation,
} from "../lib/googleWorkspace.js";
const app = createApp();
let owner: ReturnType<typeof request.agent>,
  other: ReturnType<typeof request.agent>,
  userId: string,
  otherId: string;
const provider = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(async () => {
  owner = request.agent(app);
  other = request.agent(app);
  userId = (
    await owner.post("/auth/register").send({
      name: "Nano",
      email: "owner@example.test",
      password: "supersecret123",
    })
  ).body.user.id;
  otherId = (
    await other.post("/auth/register").send({
      name: "Other",
      email: "other@example.test",
      password: "supersecret123",
    })
  ).body.user.id;
  await prisma.integration.create({
    data: {
      userId,
      provider: "google_calendar",
      status: "CONNECTED",
      accessToken: encryptToken("owner-token"),
      refreshToken: encryptToken("refresh-private"),
      expiresAt: new Date(Date.now() + 3600000),
      scopes: Object.values(GOOGLE_SCOPES).join(" "),
    },
  });
  provider.mockReset();
  vi.stubGlobal("fetch", provider);
});
afterEach(() => vi.unstubAllGlobals());
describe("Google workspace", () => {
  it("never returns tokens and refuses account changes or another user's integration", async () => {
    expect((await request(app).get("/google-workspace/mail")).status).toBe(401);
    expect(
      (await owner.get("/google-workspace/mail").set("X-Nexus-Owner", otherId))
        .status,
    ).toBe(409);
    expect(
      (await other.get("/google-workspace/mail").set("X-Nexus-Owner", otherId))
        .status,
    ).toBe(409);
    const status = await owner.get("/connectors/status");
    expect(JSON.stringify(status.body)).not.toContain("owner-token");
    expect(JSON.stringify(status.body)).not.toContain("accessToken");
    expect(provider).not.toHaveBeenCalled();
  });
  it("expands scopes only via explicit workspace consent", () => {
    const calendar = new URL(buildGoogleAuthUrl("state")),
      workspace = new URL(buildGoogleAuthUrl("state", true));
    expect(calendar.searchParams.get("scope")).toBe(GOOGLE_SCOPES.calendar);
    expect(workspace.searchParams.get("scope")).toContain(
      GOOGLE_SCOPES.gmailCompose,
    );
    expect(workspace.searchParams.get("prompt")).toBe("consent");
    expect(workspace.searchParams.get("include_granted_scopes")).toBe("true");
  });
  it("requires newly granted permissions before provider calls", async () => {
    await prisma.integration.updateMany({
      where: { userId },
      data: { scopes: GOOGLE_SCOPES.calendar },
    });
    expect(
      (await owner.get("/google-workspace/mail").set("X-Nexus-Owner", userId))
        .status,
    ).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it("refreshes expired credentials without exposing them", async () => {
    await prisma.integration.updateMany({
      where: { userId },
      data: { expiresAt: new Date(0) },
    });
    provider.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes("oauth2.googleapis.com"))
        return json({ access_token: "refreshed", expires_in: 3600 });
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer refreshed",
      );
      return json({ messages: [] });
    });
    const response = await owner
      .get("/google-workspace/mail")
      .set("X-Nexus-Owner", userId);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toContain("refreshed");
    const row = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: "google_calendar" } },
    });
    expect(decryptToken(row!.accessToken!)).toBe("refreshed");
    expect(row!.accessToken).not.toBe("refreshed");
  });
  it("lists and reads plain mail without rendering HTML or attachments", async () => {
    provider.mockImplementation(async (url: string) =>
      url.includes("messages?")
        ? json({ messages: [{ id: "msg1" }] })
        : json({
            id: "msg1",
            snippet: "Resumen",
            payload: {
              headers: [{ name: "Subject", value: "Consulta" }],
              parts: [
                {
                  mimeType: "text/html",
                  body: {
                    data: Buffer.from("<script>bad</script>").toString(
                      "base64url",
                    ),
                  },
                },
                {
                  mimeType: "text/plain",
                  body: {
                    data: Buffer.from("Texto seguro").toString("base64url"),
                  },
                },
              ],
            },
          }),
    );
    const r = await owner
      .get("/google-workspace/mail?q=from%3Aexample.test")
      .set("X-Nexus-Owner", userId);
    expect(r.status).toBe(200);
    expect(r.body.messages[0].text).toBe("Texto seguro");
    expect(JSON.stringify(r.body)).not.toContain("<script>");
  });
  it("creates a draft without sending, and requires confirmation for the unchanged exact content", async () => {
    const input = {
        to: "recipient@example.test",
        subject: "Reunión",
        body: "Contenido revisado",
      },
      raw = draftRaw(input);
    provider.mockImplementation(async (url: string) =>
      url.endsWith("/drafts")
        ? json({ id: "draft1" })
        : url.endsWith("/drafts/send")
          ? json({ id: "sent1" })
          : json({ message: { raw } }),
    );
    const r = await owner
      .post("/google-workspace/drafts")
      .set("X-Nexus-Owner", userId)
      .send(input);
    expect(r.status).toBe(201);
    expect(
      provider.mock.calls.some((c) => String(c[0]).endsWith("/send")),
    ).toBe(false);
    expect(
      (
        await owner
          .post("/google-workspace/drafts/draft1/send")
          .set("X-Nexus-Owner", userId)
          .send({ confirmationToken: r.body.confirmationToken })
      ).status,
    ).toBe(400);
    const sent = await owner
      .post("/google-workspace/drafts/draft1/send")
      .set("X-Nexus-Owner", userId)
      .send({ confirmed: true, confirmationToken: r.body.confirmationToken });
    expect(sent.status).toBe(200);
    const call = provider.mock.calls.find((c) =>
      String(c[0]).endsWith("/drafts/send"),
    );
    expect(JSON.parse(call![1].body).message.raw).toBe(raw);
  });
  it("rejects altered drafts, owner mismatch, expired or forged confirmations", async () => {
    const token = sendConfirmation(userId, "draft1", "original");
    expect(() =>
      verifyConfirmation(token, otherId, "draft1", "original"),
    ).toThrow();
    expect(() =>
      verifyConfirmation(token, userId, "draft1", "changed"),
    ).toThrow();
    expect(() =>
      verifyConfirmation(token + "broken", userId, "draft1", "original"),
    ).toThrow();
    provider.mockResolvedValue(json({ message: { raw: "changed" } }));
    const r = await owner
      .post("/google-workspace/drafts/draft1/send")
      .set("X-Nexus-Owner", userId)
      .send({ confirmed: true, confirmationToken: token });
    expect(r.status).toBe(409);
    expect(provider).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600001);
    expect(() =>
      verifyConfirmation(token, userId, "draft1", "original"),
    ).toThrow();
    vi.restoreAllMocks();
  });
  it("bounds Drive text and rejects unsupported binary files", async () => {
    provider.mockResolvedValue(
      json({ id: "file1", name: "PDF", mimeType: "application/pdf" }),
    );
    expect(
      (
        await owner
          .get("/google-workspace/drive/file1/text")
          .set("X-Nexus-Owner", userId)
      ).status,
    ).toBe(415);
    expect(await limitedText(new Response("abcdef"), 3)).toEqual({
      text: "abc",
      truncated: true,
    });
    provider.mockImplementation(async (url: string) =>
      url.includes("/export?")
        ? new Response("Texto de documento")
        : json({
            id: "doc1",
            name: "Documento",
            mimeType: "application/vnd.google-apps.document",
          }),
    );
    const r = await owner
      .get("/google-workspace/drive/doc1/text")
      .set("X-Nexus-Owner", userId);
    expect(r.body.text).toBe("Texto de documento");
  });
  it("returns essential contact context and warms search cache", async () => {
    provider.mockImplementation(async (url: string) =>
      new URL(url).searchParams.get("query") === ""
        ? json({ results: [] })
        : json({
            results: [
              {
                person: {
                  resourceName: "people/1",
                  names: [{ displayName: "Lina" }],
                  emailAddresses: [{ value: "lina@example.test" }],
                  phoneNumbers: [{ value: "123" }],
                  organizations: [{ name: "Hospital" }],
                },
              },
            ],
          }),
    );
    const r = await owner
      .get("/google-workspace/contacts?q=Lina")
      .set("X-Nexus-Owner", userId);
    expect(r.status).toBe(200);
    expect(r.body.contacts[0]).toMatchObject({
      name: "Lina",
      organization: "Hospital",
      emails: ["lina@example.test"],
    });
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("hides provider error bodies and never retries uncertain sends", async () => {
    provider.mockResolvedValue(json({ error: "secret token or content" }, 403));
    const r = await owner
      .get("/google-workspace/mail")
      .set("X-Nexus-Owner", userId);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain("secret");
  });
});
