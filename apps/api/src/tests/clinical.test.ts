import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { randomUUID } from "node:crypto";

const app = createApp();
let owner: ReturnType<typeof request.agent>,
  other: ReturnType<typeof request.agent>;
beforeEach(async () => {
  owner = request.agent(app);
  other = request.agent(app);
  await owner.post("/auth/register").send({
    name: "Médico de prueba",
    email: "doctor@example.test",
    password: "supersecret123",
  });
  await other.post("/auth/register").send({
    name: "Otro médico",
    email: "other@example.test",
    password: "supersecret123",
  });
});
async function patient() {
  const r = await owner.post("/clinical/patients").send({
    name: "Paciente Ficticio",
    document: "12345678",
    allergies: "Dato ficticio reservado",
  });
  expect(r.status).toBe(201);
  return r.body.patient;
}
async function encounter(patientId: string, clientId = randomUUID()) {
  return owner.post(`/clinical/patients/${patientId}/encounters`).send({
    clientId,
    templateId: "first",
    occurredAt: new Date().toISOString(),
    fields: { reason: "Consulta de prueba" },
  });
}
describe("clinical workspace", () => {
  it("rejects stale clinical account headers before reads and mutations", async () => {
    const otherUser = (await other.get("/auth/me")).body.user;
    const wrongOwner = { "X-Nexus-Owner": otherUser.id };
    expect((await owner.get("/clinical/patients").set(wrongOwner)).status).toBe(
      409,
    );
    expect(
      (
        await owner
          .post("/clinical/patients")
          .set(wrongOwner)
          .send({ name: "Wrong account" })
      ).status,
    ).toBe(409);
    expect(await prisma.patient.count()).toBe(0);
  });
  it("freezes identities at validation and rejects unreviewed dictation", async () => {
    const p = await patient(),
      c = (await encounter(p.id)).body.encounter;
    const saved = await owner
      .put(`/clinical/encounters/${c.id}`)
      .send({ ...c, dictation: "Texto pendiente" });
    expect(
      (
        await owner
          .post(`/clinical/encounters/${c.id}/finalize`)
          .send({ version: saved.body.encounter.version, confirmed: true })
      ).status,
    ).toBe(400);
    const cleared = await owner
      .put(`/clinical/encounters/${c.id}`)
      .send({ ...saved.body.encounter, dictation: "" });
    const final = await owner
      .post(`/clinical/encounters/${c.id}/finalize`)
      .send({ version: cleared.body.encounter.version, confirmed: true });
    expect(final.status).toBe(200);
    expect(final.body.encounter.patientSnapshot.name).toBe(p.name);
    expect(final.body.encounter.clinicianSnapshot.name).toBe(
      "Médico de prueba",
    );
    await owner
      .put(`/clinical/patients/${p.id}`)
      .send({ ...p, name: "Nombre modificado", document: "99999999" });
    await prisma.user.update({
      where: { id: final.body.encounter.clinicianSnapshot.id },
      data: { name: "Nombre profesional modificado" },
    });
    const read = await owner.get(`/clinical/encounters/${c.id}`);
    expect(read.body.patient.name).toBe("Nombre modificado");
    expect(read.body.encounter.patientSnapshot.name).toBe(p.name);
    expect(read.body.encounter.patientSnapshot.document).toBe(p.document);
    expect(read.body.encounter.clinicianSnapshot.name).toBe("Médico de prueba");
    expect(
      (await owner.get(`/clinical/patients/${p.id}/export`)).body.encounters[0]
        .patientSnapshot.name,
    ).toBe(p.name);
  });
  it("paginates all followups and preserves owner isolation", async () => {
    const p = await patient();
    for (let i = 0; i < 51; i++)
      await owner
        .post("/clinical/followups")
        .send({
          patientId: p.id,
          title: `Pendiente ${i}`,
          dueAt: new Date(Date.now() + i * 1000).toISOString(),
        });
    const first = await owner.get("/clinical/followups?page=1"),
      second = await owner.get("/clinical/followups?page=2");
    expect(first.body.total).toBe(51);
    expect(first.body.followups).toHaveLength(50);
    expect(second.body.followups).toHaveLength(1);
    expect(second.body.followups[0].title).toBe("Pendiente 50");
    expect((await other.get("/clinical/followups?page=2")).body.total).toBe(0);
  });

  it("requires authentication and does not cache clinical responses", async () => {
    expect((await request(app).get("/clinical/patients")).status).toBe(401);
    const r = await owner.get("/clinical/patients");
    expect(r.headers["cache-control"]).toContain("no-store");
  });
  it("encrypts patient data and prevents cross-user reads, writes and exports", async () => {
    const p = await patient(),
      stored = await prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
    expect(stored.recordEncrypted).not.toContain("Ficticio");
    expect(stored.recordEncrypted).not.toContain("12345678");
    for (const suffix of ["", "/export"])
      expect(
        (await other.get(`/clinical/patients/${p.id}${suffix}`)).status,
      ).toBe(404);
    expect(
      (
        await other
          .put(`/clinical/patients/${p.id}`)
          .send({ ...p, name: "Cambio" })
      ).status,
    ).toBe(404);
    expect(
      (
        await other.post(`/clinical/patients/${p.id}/encounters`).send({
          clientId: randomUUID(),
          templateId: "first",
          occurredAt: new Date().toISOString(),
        })
      ).status,
    ).toBe(404);
  });
  it("searches encrypted names/documents and rejects duplicate documents per owner", async () => {
    await patient();
    expect((await owner.get("/clinical/patients?q=Ficti")).body.total).toBe(1);
    expect((await owner.get("/clinical/patients?q=1234")).body.total).toBe(1);
    expect((await other.get("/clinical/patients?q=Ficti")).body.total).toBe(0);
    expect(
      (
        await owner
          .post("/clinical/patients")
          .send({ name: "Duplicado", document: "12.345.678" })
      ).status,
    ).toBe(409);
  });
  it("rejects stale patient edits", async () => {
    const p = await patient();
    expect(
      (
        await owner
          .put(`/clinical/patients/${p.id}`)
          .send({ ...p, history: "Actualizado" })
      ).status,
    ).toBe(200);
    expect(
      (
        await owner
          .put(`/clinical/patients/${p.id}`)
          .send({ ...p, history: "Anterior" })
      ).status,
    ).toBe(409);
  });
  it("creates idempotent encounters, preserves missing fields and blocks edits after validation", async () => {
    const p = await patient(),
      clientId = randomUUID(),
      r = await encounter(p.id, clientId),
      c = r.body.encounter;
    expect(r.status).toBe(201);
    expect(c.fields.exam).toBeUndefined();
    expect((await encounter(p.id, clientId)).body.encounter.id).toBe(c.id);
    expect(await prisma.clinicalEncounter.count()).toBe(1);
    expect((await other.get(`/clinical/encounters/${c.id}`)).status).toBe(404);
    expect(
      (
        await owner
          .post(`/clinical/encounters/${c.id}/finalize`)
          .send({ version: c.version, confirmed: false })
      ).status,
    ).toBe(400);
    const final = await owner
      .post(`/clinical/encounters/${c.id}/finalize`)
      .send({ version: c.version, confirmed: true });
    expect(final.status).toBe(200);
    expect(
      (
        await owner
          .put(`/clinical/encounters/${c.id}`)
          .send({ ...c, fields: { reason: "Cambiar" } })
      ).status,
    ).toBe(409);
    expect(
      (await owner.get(`/clinical/patients/${p.id}/export`)).body.encounters
        .length,
    ).toBe(1);
  });
  it("rejects stale encounters and foreign template fields", async () => {
    const p = await patient(),
      c = (await encounter(p.id)).body.encounter;
    expect(
      (
        await owner
          .put(`/clinical/encounters/${c.id}`)
          .send({ ...c, fields: { invented: "Hallazgo" } })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .put(`/clinical/encounters/${c.id}`)
          .send({ ...c, fields: { reason: "Nueva versión" } })
      ).status,
    ).toBe(200);
    expect(
      (await owner.put(`/clinical/encounters/${c.id}`).send(c)).status,
    ).toBe(409);
  });
  it("isolates followups, custom templates and clinical data from personal memories", async () => {
    const p = await patient();
    const custom = await owner.post("/clinical/templates").send({
      name: "Mi plantilla",
      fields: [{ key: "reason", label: "Motivo" }],
    });
    expect(custom.status).toBe(201);
    expect(
      (await other.get("/clinical/templates")).body.templates.some(
        (t: { id: string }) => t.id === custom.body.template.id,
      ),
    ).toBe(false);
    const f = await owner.post("/clinical/followups").send({
      patientId: p.id,
      title: "Revisar estudio ficticio",
      dueAt: new Date().toISOString(),
      kind: "RESULT",
    });
    expect(f.status).toBe(201);
    expect(
      (
        await other
          .patch(`/clinical/followups/${f.body.followup.id}`)
          .send({ status: "DONE" })
      ).status,
    ).toBe(404);
    expect(
      (
        await owner
          .patch(`/clinical/followups/${f.body.followup.id}`)
          .send({ status: "DONE" })
      ).status,
    ).toBe(204);
    expect(await prisma.memory.count()).toBe(0);
    expect(await prisma.inboxItem.count()).toBe(0);
    const audit = await prisma.auditLog.findMany({
      where: { action: { startsWith: "clinical." } },
    });
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain("Dato ficticio reservado");
  });
});
