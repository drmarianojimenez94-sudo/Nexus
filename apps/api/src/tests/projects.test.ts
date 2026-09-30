import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { parseProjectDraft } from "../lib/projectPlanning.js";
const app = createApp();
let owner: ReturnType<typeof request.agent>;
let other: ReturnType<typeof request.agent>;
beforeEach(async () => {
  owner = request.agent(app);
  other = request.agent(app);
  await owner
    .post("/auth/register")
    .send({
      name: "Owner",
      email: "owner@project.test",
      password: "supersecret123",
    });
  await other
    .post("/auth/register")
    .send({
      name: "Other",
      email: "other@project.test",
      password: "supersecret123",
    });
});
describe("project planning and tasks", () => {
  it("preserves unstructured prose and only extracts explicitly labelled tasks", () => {
    expect(
      parseProjectDraft("Me gustaría abrir un consultorio cerca del hospital"),
    ).toEqual({
      name: "",
      goal: "Me gustaría abrir un consultorio cerca del hospital",
      tasks: [],
    });
    expect(
      parseProjectDraft(
        "Proyecto: Consultorio. Descripción: atención ambulatoria. Pendientes: elegir local; comprar equipo",
      ),
    ).toEqual({
      name: "Consultorio",
      goal: "atención ambulatoria.",
      tasks: ["elegir local", "comprar equipo"],
    });
  });
  it("returns a revisable draft without creating projects or tasks", async () => {
    const res = await owner
      .post("/projects/plan")
      .send({
        text: "Proyecto: Vacaciones. Pendientes: elegir hotel; reservar pasajes",
      });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.draft.tasks).toHaveLength(2);
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.task.count()).toBe(0);
  });
  it("atomically creates tasks once for simultaneous retries and calculates real progress", async () => {
    const body = {
      name: "Consultorio",
      goal: "Descripción completa",
      tasks: ["Elegir local", "Preparar agenda"],
      clientId: randomUUID(),
    };
    const [a, b] = await Promise.all([
      owner.post("/projects").send(body),
      owner.post("/projects").send(body),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.project.id).toBe(b.body.project.id);
    expect(await prisma.task.count()).toBe(2);
    const task = a.body.project.tasks[0];
    await owner.patch(`/tasks/${task.id}`).send({ status: "DONE" });
    expect(
      (await owner.get(`/projects/${a.body.project.id}`)).body.project.progress,
    ).toBe(50);
    expect((await owner.get("/projects")).body.projects[0].progress).toBe(50);
    await owner.patch(`/projects/${a.body.project.id}`).send({ progress: 100 });
    expect(
      (await owner.get(`/projects/${a.body.project.id}`)).body.project.progress,
    ).toBe(50);
    await owner.patch(`/tasks/${task.id}`).send({ status: "TODO" });
    expect(
      (await prisma.task.findUnique({ where: { id: task.id } }))?.completedAt,
    ).toBeNull();
  });
  it("rejects invalid tasks before writing a partial project", async () => {
    expect(
      (await owner.post("/projects").send({ name: "Proyecto", tasks: [""] }))
        .status,
    ).toBe(400);
    expect(await prisma.project.count()).toBe(0);
  });
  it("rejects foreign project, area and subtask associations", async () => {
    const project = (await other.post("/projects").send({ name: "Otro" })).body
      .project;
    const area = (await other.post("/areas").send({ name: "Privada" })).body
      .area;
    expect(
      (await owner.post("/projects").send({ name: "Propio", areaId: area.id }))
        .status,
    ).toBe(404);
    expect(
      (
        await owner
          .post("/tasks")
          .send({ title: "Intrusión", projectId: project.id })
      ).status,
    ).toBe(404);
    expect(
      (await owner.post("/tasks").send({ title: "Intrusión", areaId: area.id }))
        .status,
    ).toBe(404);
    const own = (await owner.post("/tasks").send({ title: "Propia" })).body
      .task;
    expect(
      (await owner.patch(`/tasks/${own.id}`).send({ projectId: project.id }))
        .status,
    ).toBe(404);
    const foreign = (await other.post("/tasks").send({ title: "Ajena" })).body
      .task;
    const sub = (
      await other
        .post(`/tasks/${foreign.id}/subtasks`)
        .send({ title: "Secreto" })
    ).body.subtask;
    expect(
      (
        await owner
          .patch(`/tasks/${own.id}/subtasks/${sub.id}`)
          .send({ done: true })
      ).status,
    ).toBe(404);
    expect((await owner.get(`/projects/${project.id}`)).status).toBe(404);
  });
});
