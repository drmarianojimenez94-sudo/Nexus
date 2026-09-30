import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
const app = createApp();
let owner: ReturnType<typeof request.agent>,
  other: ReturnType<typeof request.agent>;
const input = {
  name: "Control personal",
  description: "Prueba",
  fields: [{ key: "reason", label: "Motivo" }],
};
beforeEach(async () => {
  owner = request.agent(app);
  other = request.agent(app);
  await owner
    .post("/auth/register")
    .send({
      name: "Doctor",
      email: "doctor@example.test",
      password: "supersecret123",
    });
  await other
    .post("/auth/register")
    .send({
      name: "Otro",
      email: "other@example.test",
      password: "supersecret123",
    });
});
describe("clinical template lifecycle", () => {
  it("creates idempotently and encrypts personal templates", async () => {
    const clientId = randomUUID();
    const first = await owner
      .post("/clinical/templates")
      .send({ ...input, clientId });
    const second = await owner
      .post("/clinical/templates")
      .send({ ...input, clientId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.template.id).toBe(first.body.template.id);
    expect(
      (
        await owner
          .post("/clinical/templates")
          .send({ ...input, name: "Contenido diferente", clientId })
      ).status,
    ).toBe(409);
    const row = await prisma.clinicalTemplate.findUniqueOrThrow({
      where: { id: first.body.template.id },
    });
    expect(row.recordEncrypted).not.toContain(input.name);
    expect(
      (await other.get("/clinical/templates")).body.templates.some(
        (t: { id: string }) => t.id === row.id,
      ),
    ).toBe(false);
  });
  it("keeps encounter snapshots immutable when publishing a new template version", async () => {
    const first = (await owner.post("/clinical/templates").send(input)).body
      .template;
    const patient = (
      await owner.post("/clinical/patients").send({ name: "Paciente prueba" })
    ).body.patient;
    const consultation = await owner
      .post(`/clinical/patients/${patient.id}/encounters`)
      .send({
        clientId: randomUUID(),
        templateId: first.id,
        occurredAt: new Date().toISOString(),
        fields: { reason: "Prueba" },
      });
    expect(consultation.status).toBe(201);
    const payload = {
      ...input,
      name: "Control renovado",
      revision: first.revision,
      clientId: randomUUID(),
      fields: [{ key: "plan", label: "Conducta" }],
    };
    const updated = await owner
      .post(`/clinical/templates/${first.id}/versions`)
      .send(payload);
    expect(updated.status).toBe(201);
    expect(updated.body.template.version).toBe(2);
    expect(
      (
        await owner
          .post(`/clinical/templates/${first.id}/versions`)
          .send(payload)
      ).body.template.id,
    ).toBe(updated.body.template.id);
    expect(
      (
        await owner.get(
          `/clinical/encounters/${consultation.body.encounter.id}`,
        )
      ).body.encounter.template.fields,
    ).toEqual(input.fields);
    expect(
      (
        await owner.get(
          `/clinical/templates/${updated.body.template.id}/versions`,
        )
      ).body.templates,
    ).toHaveLength(2);
    const old = (
      await owner.get("/clinical/templates?archived=true")
    ).body.templates.find((t: { id: string }) => t.id === first.id);
    expect(
      (
        await owner
          .patch(`/clinical/templates/${first.id}`)
          .send({ revision: old.revision, archived: false })
      ).status,
    ).toBe(409);
    expect(
      (await owner.get("/clinical/templates")).body.templates.some(
        (t: { id: string }) => t.id === first.id,
      ),
    ).toBe(false);
    expect(
      (
        await owner
          .post(`/clinical/patients/${patient.id}/encounters`)
          .send({
            clientId: randomUUID(),
            templateId: first.id,
            occurredAt: new Date().toISOString(),
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await other.get(
          `/clinical/templates/${updated.body.template.id}/versions`,
        )
      ).status,
    ).toBe(404);
  });
  it("uses optimistic metadata changes and separates builtin preferences by owner", async () => {
    const favorite = await owner
      .patch("/clinical/templates/first")
      .send({ revision: 1, favorite: true });
    expect(favorite.status).toBe(200);
    expect(favorite.body.template.favorite).toBe(true);
    expect(
      (
        await owner
          .patch("/clinical/templates/first")
          .send({ revision: 1, archived: true })
      ).status,
    ).toBe(409);
    const archive = await owner
      .patch("/clinical/templates/first")
      .send({ revision: favorite.body.template.revision, archived: true });
    expect(archive.status).toBe(200);
    expect(
      (await owner.get("/clinical/templates?archived=true")).body.templates.map(
        (t: { id: string }) => t.id,
      ),
    ).toEqual(["first"]);
    expect(
      (await other.get("/clinical/templates")).body.templates.find(
        (t: { id: string }) => t.id === "first",
      ).favorite,
    ).toBe(false);
    const builtinEdit = await owner
      .post("/clinical/templates/first/versions")
      .send({ ...input, revision: 1, clientId: randomUUID() });
    expect(builtinEdit.status).toBe(400);
    const restored = await owner
      .patch("/clinical/templates/first")
      .send({ revision: archive.body.template.revision, archived: false });
    expect(restored.status).toBe(200);
    expect(
      (await owner.get("/clinical/templates?q=primera")).body.templates,
    ).toHaveLength(1);
  });
  it("rejects cross-owner mutations and concurrent stale version publications", async () => {
    const template = (await owner.post("/clinical/templates").send(input)).body
      .template;
    expect(
      (
        await other
          .patch(`/clinical/templates/${template.id}`)
          .send({ revision: 1, favorite: true })
      ).status,
    ).toBe(404);
    const payload = {
      ...input,
      revision: template.revision,
      clientId: randomUUID(),
    };
    expect(
      (
        await owner
          .post(`/clinical/templates/${template.id}/versions`)
          .send(payload)
      ).status,
    ).toBe(201);
    expect(
      (
        await owner
          .post(`/clinical/templates/${template.id}/versions`)
          .send({ ...payload, clientId: randomUUID() })
      ).status,
    ).toBe(409);
    expect(
      (
        await owner
          .post(`/clinical/templates/${template.id}/versions`)
          .send({ ...payload, fields: [{ key: "bad", label: "" }] })
      ).status,
    ).toBe(400);
  });
});
