import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { encryptClinical } from "../lib/clinicalCrypto.js";
import { CLINICAL_TEMPLATES } from "@nexus/shared";
import { createApp } from "../app.js";
const app = createApp();
let owner: ReturnType<typeof request.agent>,
  other: ReturnType<typeof request.agent>;
beforeEach(async () => {
  owner = request.agent(app);
  other = request.agent(app);
  await owner
    .post("/auth/register")
    .send({
      name: "Doctor",
      email: "history@example.test",
      password: "supersecret123",
    });
  await other
    .post("/auth/register")
    .send({
      name: "Other",
      email: "otherhistory@example.test",
      password: "supersecret123",
    });
});
describe("clinical history and followup edits", () => {
  it("pages beyond 100 records and filters encrypted fields and templates with owner isolation", async () => {
    const p = (
      await owner
        .post("/clinical/patients")
        .send({ name: "Historial ficticio" })
    ).body.patient;
    const userId = (await owner.get("/auth/me")).body.user.id;
    await prisma.clinicalEncounter.createMany({
      data: Array.from({ length: 101 }, (_, i) => {
        const id = randomUUID(),
          template = CLINICAL_TEMPLATES.find(
            (t) => t.id === (i === 100 ? "progress" : "first"),
          )!;
        const occurredAt = `2026-09-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`;
        return {
          id,
          userId,
          patientId: p.id,
          clientId: randomUUID(),
          occurredAt: new Date(occurredAt),
          recordEncrypted: encryptClinical(
            {
              templateId: template.id,
              template,
              occurredAt,
              fields:
                i === 100 ? { subjective: "Especial" } : { reason: "Control" },
              dictation: "",
            },
            `${userId}:encounter:${id}`,
          ),
        };
      }),
    });
    const page = await owner.get(`/clinical/patients/${p.id}/history?page=4`);
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(101);
    expect(page.body.encounters).toHaveLength(11);
    const filtered = await owner.get(
      `/clinical/patients/${p.id}/history?templateId=progress&q=especial`,
    );
    expect(filtered.body.total).toBe(1);
    expect(
      (
        await owner.get(
          `/clinical/patients/${p.id}/history?from=2026-10-01T00:00:00.000Z`,
        )
      ).body.total,
    ).toBe(0);
    expect(
      (await owner.get(`/clinical/patients/${p.id}/history?status=FINAL`)).body
        .total,
    ).toBe(0);
    expect(
      (
        await owner.get(
          `/clinical/patients/${p.id}/history?from=2026-10-01T00:00:00.000Z&to=2026-09-01T00:00:00.000Z`,
        )
      ).status,
    ).toBe(400);
    expect((await other.get(`/clinical/patients/${p.id}/history`)).status).toBe(
      404,
    );
    await owner
      .put(`/clinical/patients/${p.id}`)
      .send({ ...p, archived: true });
    expect(
      (await owner.get("/clinical/patients?archived=false")).body.total,
    ).toBe(0);
    expect(
      (await owner.get("/clinical/patients?archived=all")).body.total,
    ).toBe(1);
  });
  it("edits followups with optimistic concurrency and protects other accounts", async () => {
    const p = (
      await owner.post("/clinical/patients").send({ name: "Paciente ficticio" })
    ).body.patient;
    const created = await owner
      .post("/clinical/followups")
      .send({
        patientId: p.id,
        title: "Control",
        dueAt: "2026-10-01T12:00:00.000Z",
      });
    const id = created.body.followup.id,
      edit = {
        title: "Resultado",
        kind: "RESULT",
        dueAt: "2026-10-02T12:00:00.000Z",
        version: 1,
      };
    expect(
      (await other.put(`/clinical/followups/${id}`).send(edit)).status,
    ).toBe(404);
    expect(
      (await owner.put(`/clinical/followups/${id}`).send(edit)).status,
    ).toBe(204);
    expect(
      (await owner.put(`/clinical/followups/${id}`).send(edit)).status,
    ).toBe(409);
    const f = (await owner.get("/clinical/followups")).body.followups[0];
    expect(f.title).toBe("Resultado");
    expect(f.kind).toBe("RESULT");
    expect(f.version).toBe(2);
    expect(
      (
        await owner
          .patch(`/clinical/followups/${id}`)
          .send({ status: "DONE", version: 1 })
      ).status,
    ).toBe(409);
  });
});
