import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

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

describe("today", () => {
  it("returns an empty-but-valid shape with no data", async () => {
    const res = await agent.get("/today");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ priorities: [], timeline: [], attention: [] });
  });

  it("surfaces overdue tasks under attention", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await agent.post("/tasks").send({ title: "Tarea vieja", deadline: yesterday.toISOString() });

    const res = await agent.get("/today");
    expect(res.body.attention.some((a: string) => a.includes("atrasada"))).toBe(true);
  });
});
