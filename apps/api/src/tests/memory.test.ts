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

describe("memory", () => {
  it("saves a memory and lists it back", async () => {
    const created = await agent.post("/memories").send({ content: "Mi hijo se llama Tomás" });
    expect(created.status).toBe(201);
    expect(created.body.memory.source).toBe("user_explicit");

    const list = await agent.get("/memories");
    expect(list.body.memories).toHaveLength(1);
    expect(list.body.memories[0].content).toBe("Mi hijo se llama Tomás");
  });

  it("searches memories by content", async () => {
    await agent.post("/memories").send({ content: "Mi hijo se llama Tomás" });
    await agent.post("/memories").send({ content: "El consultorio abre a las 9" });

    const matches = await agent.get("/memories").query({ q: "tomás" });
    expect(matches.body.memories).toHaveLength(1);
    expect(matches.body.memories[0].content).toContain("Tomás");
  });

  it("edits and deletes a memory", async () => {
    const created = await agent.post("/memories").send({ content: "Borrador" });
    const id = created.body.memory.id;

    const updated = await agent.patch(`/memories/${id}`).send({ content: "Versión final" });
    expect(updated.body.memory.content).toBe("Versión final");

    const deleted = await agent.delete(`/memories/${id}`);
    expect(deleted.status).toBe(204);

    const list = await agent.get("/memories");
    expect(list.body.memories).toHaveLength(0);
  });

  it("blocks access to another user's memory", async () => {
    const created = await agent.post("/memories").send({ content: "Secreto" });
    const id = created.body.memory.id;

    const other = request.agent(app);
    await other.post("/auth/register").send({
      name: "Otra",
      email: "otra@example.com",
      password: "supersecret123",
    });

    const res = await other.patch(`/memories/${id}`).send({ content: "Hackeado" });
    expect(res.status).toBe(404);
  });
});
