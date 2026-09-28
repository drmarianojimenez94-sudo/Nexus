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

describe("tasks", () => {
  it("creates a task with just a title", async () => {
    const res = await agent.post("/tasks").send({ title: "Comprar leche" });
    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe("Comprar leche");
    expect(res.body.task.status).toBe("TODO");
  });

  it("rejects an empty title", async () => {
    const res = await agent.post("/tasks").send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("marks a task done and stamps completedAt", async () => {
    const created = await agent.post("/tasks").send({ title: "Comprar leche" });
    const res = await agent.patch(`/tasks/${created.body.task.id}`).send({ status: "DONE" });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe("DONE");
    expect(res.body.task.completedAt).not.toBeNull();
  });

  it("blocks access to another user's task", async () => {
    const created = await agent.post("/tasks").send({ title: "Comprar leche" });

    const otherAgent = request.agent(app);
    await otherAgent.post("/auth/register").send({
      name: "Otra persona",
      email: "otra@example.com",
      password: "supersecret123",
    });

    const res = await otherAgent.patch(`/tasks/${created.body.task.id}`).send({ status: "DONE" });
    expect(res.status).toBe(404);
  });
});

describe("first functional milestone (spec §55)", () => {
  it("persists a project task and a reminder created in the same session", async () => {
    const project = await agent.post("/projects").send({ name: "La Horda" });
    expect(project.status).toBe(201);

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);
    const task = await agent
      .post("/tasks")
      .send({ title: "Terminar lobby", projectId: project.body.project.id, deadline: deadline.toISOString() });
    expect(task.status).toBe(201);

    const remindAt = new Date();
    remindAt.setDate(remindAt.getDate() + 1);
    remindAt.setHours(9, 0, 0, 0);
    const reminder = await agent
      .post("/reminders")
      .send({ title: "Llamar al contador", remindAt: remindAt.toISOString() });
    expect(reminder.status).toBe(201);

    // Simulate reopening the app: fetch everything back and confirm it survived.
    const projects = await agent.get("/projects");
    const tasks = await agent.get("/tasks");
    const reminders = await agent.get("/reminders");

    expect(projects.body.projects.map((p: { name: string }) => p.name)).toContain("La Horda");
    expect(tasks.body.tasks.map((t: { title: string }) => t.title)).toContain("Terminar lobby");
    expect(reminders.body.reminders.map((r: { title: string }) => r.title)).toContain("Llamar al contador");
  });
});
