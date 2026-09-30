import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { randomUUID } from "node:crypto";

const app = createApp();
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  agent = request.agent(app);
  await agent.post("/auth/register").send({
    name: "Mariano",
    email: "mariano@example.com",
    password: "supersecret123",
  });
});

describe("quick capture / inbox", () => {
  it("deduplicates a retried capture and rejects a changed session owner", async () => {
    const captureId = randomUUID();
    const first = await agent
      .post("/quick-capture")
      .send({ rawText: "Una nota", captureId });
    const second = await agent
      .post("/quick-capture")
      .send({ rawText: "Una nota", captureId });
    expect(second.body.item.id).toBe(first.body.item.id);
    expect((await agent.get("/inbox")).body.items).toHaveLength(1);
    expect(
      (
        await agent.post("/quick-capture").send({
          rawText: "Otra cuenta",
          captureId: randomUUID(),
          expectedOwnerId: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });
  it("captures an unclassified thought", async () => {
    const res = await agent
      .post("/quick-capture")
      .send({ rawText: "Acordarme algún día de arreglar la camioneta" });
    expect(res.status).toBe(201);
    expect(res.body.item.status).toBe("PENDING");
  });

  it("lists only pending items and dismiss removes them", async () => {
    const created = await agent
      .post("/inbox")
      .send({ rawText: "Algo para revisar" });
    const before = await agent.get("/inbox");
    expect(before.body.items).toHaveLength(1);

    await agent.post(`/inbox/${created.body.item.id}/dismiss`);
    const after = await agent.get("/inbox");
    expect(after.body.items).toHaveLength(0);
  });
});
