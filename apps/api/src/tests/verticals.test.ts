import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { executePlan, type ApiRequest, type PlanStep } from "@nexus/verticals";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();
let doctor: ReturnType<typeof request.agent>;
let other: ReturnType<typeof request.agent>;
beforeEach(async () => {
  doctor = request.agent(app);
  other = request.agent(app);
  await doctor.post("/auth/register").send({ name: "Dra. Prueba", email: "dra@example.test", password: "supersecret123" });
  await other.post("/auth/register").send({ name: "Otro", email: "otro@example.test", password: "supersecret123" });
});

/** Ejecuta los pasos del plan contra la API real, como lo hace el cliente. */
const fetcher = (agent: ReturnType<typeof request.agent>) => async (r: ApiRequest) => {
  const res = await agent[r.method.toLowerCase() as "get" | "post"](r.path).send(r.body ?? {});
  if (res.status >= 400) throw new Error(`${r.method} ${r.path} → ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

describe("verticales", () => {
  it("lista la vertical médica aprobada con su puntaje y oculta las de borrador", async () => {
    const res = await doctor.get("/verticals");
    expect(res.status).toBe(200);
    const ids = res.body.verticals.map((v: { id: string }) => v.id);
    expect(ids).toContain("medicine");
    expect(ids).not.toContain("legal");
    expect(res.body.verticals.find((v: { id: string }) => v.id === "medicine").score).toBeGreaterThanOrEqual(90);
    expect((await doctor.get("/verticals/legal")).status).toBe(404);
    const card = await doctor.get("/verticals/medicine/scorecard");
    expect(card.body.scorecard.passed).toBe(true);
  });

  it("exige sesión", async () => {
    expect((await request(app).get("/verticals")).status).toBe(401);
  });

  it("dictado → plan revisable → confirmación → ficha, consulta borrador, seguimiento y Mi día", async () => {
    const text =
      "Paciente nuevo Juan Pérez, DNI 30.123.456, alérgico a la penicilina, consulta por cefalea, niega fiebre, TA 150/95. Le indico ibuprofeno 400 mg cada 8 horas. Control en 2 semanas y llamarlo el viernes.";
    const res = await doctor.post("/verticals/medicine/capture").send({ text, captureMode: "dictated" });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    const steps: PlanStep[] = res.body.plan.steps;
    expect(steps.map((s) => s.kind)).toEqual(["create_subject", "create_record", "create_followup", "create_followup"]);
    // Nada se escribió todavía.
    expect(await prisma.patient.count()).toBe(0);
    // La auditoría no contiene el texto clínico.
    const audit = await prisma.auditLog.findFirst({ where: { action: "vertical.capture.interpret" } });
    expect(JSON.stringify(audit)).not.toContain("Pérez");

    const done = await executePlan(steps, fetcher(doctor));
    expect(Object.keys(done)).toHaveLength(4);
    const patientId = done[steps[0]!.id]!;
    const detail = await doctor.get(`/clinical/patients/${patientId}`);
    expect(detail.body.patient).toMatchObject({ name: "Juan Pérez", document: "30.123.456".replace(/\D/g, ""), allergies: "penicilina" });
    const encounter = detail.body.encounters[0];
    expect(encounter.status).toBe("DRAFT");
    expect(encounter.folio).toBe(1);
    expect(encounter.fields.plan).toContain("ibuprofeno 400 mg");
    // Todo el dictado quedó en campos: no hay transcripción pendiente y se puede validar tras revisar.
    expect(encounter.dictation).toBe("");

    const day = await doctor.get("/verticals/medicine/day");
    expect(day.status).toBe(200);
    expect(day.body.brief.drafts.map((d: { subjectName: string }) => d.subjectName)).toEqual(["Juan Pérez"]);
    expect(day.body.brief.upcoming.length + day.body.brief.dueToday.length).toBeGreaterThanOrEqual(1);
    // Otro usuario no ve nada.
    const otherDay = await other.get("/verticals/medicine/day");
    expect(otherDay.body.brief.drafts).toEqual([]);
  });

  it("usa las alergias de la ficha abierta para avisar conflictos", async () => {
    const p = await doctor.post("/clinical/patients").send({ name: "Rosa Medina", allergies: "Penicilina" });
    const res = await doctor.post("/verticals/medicine/capture").send({ text: "Indico amoxicilina 500 mg cada 8 horas.", subjectId: p.body.patient.id });
    expect(res.body.plan.safety.allergyConflicts).toHaveLength(1);
    expect(res.body.plan.steps[0].request.path).toBe(`/clinical/patients/${p.body.patient.id}/encounters`);
    const foreign = await other.post("/verticals/medicine/capture").send({ text: "Control en una semana", subjectId: p.body.patient.id });
    expect(foreign.status).toBe(404);
  });

  it("no captura una conversación con el paciente sin consentimiento confirmado", async () => {
    const res = await doctor.post("/verticals/medicine/capture").send({ text: "Paciente Ana Gómez consulta por tos.", captureMode: "ambient" });
    expect(res.status).toBe(400);
    const ok = await doctor.post("/verticals/medicine/capture").send({ text: "Paciente Ana Gómez consulta por tos.", captureMode: "ambient", consentConfirmed: true });
    expect(ok.status).toBe(200);
  });

  it("el asistente general deriva datos de pacientes sin enviarlos a la IA ni al inbox", async () => {
    const res = await doctor.post("/assistant/interpret").send({ text: "Paciente Juan Pérez con dolor de pecho, TA 160/100" });
    expect(res.status).toBe(200);
    expect(res.body.navigateTo).toBe("/patients/capture");
    expect(res.body.handoff.vertical).toBe("medicine");
    expect(await prisma.inboxItem.count()).toBe(0);
    // Lo no clínico sigue el camino habitual (sin IA configurada en pruebas: 501).
    expect((await doctor.post("/assistant/interpret").send({ text: "recordame comprar café" })).status).toBe(501);
  });

  it("copia especialidad y matrícula del perfil profesional al validar", async () => {
    await doctor.put("/preferences/clinical_profile").send({ value: { specialty: "Clínica médica", license: "MN 123456" } });
    const p = await doctor.post("/clinical/patients").send({ name: "Hugo Méndez", familyContact: "Esposa: Laura, 11 5555-0000" });
    expect(p.body.patient.familyContact).toBe("Esposa: Laura, 11 5555-0000");
    const e = await doctor.post(`/clinical/patients/${p.body.patient.id}/encounters`).send({
      clientId: crypto.randomUUID(),
      templateId: "soap",
      occurredAt: new Date().toISOString(),
      fields: { subjective: "Odinofagia", plan: "Control" },
    });
    expect(e.status).toBe(201);
    const fin = await doctor.post(`/clinical/encounters/${e.body.encounter.id}/finalize`).send({ version: e.body.encounter.version, confirmed: true });
    expect(fin.status).toBe(200);
    expect(fin.body.encounter.clinicianSnapshot).toMatchObject({ name: "Dra. Prueba", specialty: "Clínica médica", license: "MN 123456" });
    expect(fin.body.encounter.patientSnapshot.familyContact).toBe("Esposa: Laura, 11 5555-0000");
  });

  it("acepta plantillas de otras verticales como plantillas base", async () => {
    const p = await doctor.post("/clinical/patients").send({ name: "Cliente Ficticio" });
    const e = await doctor.post(`/clinical/patients/${p.body.patient.id}/encounters`).send({
      clientId: crypto.randomUUID(),
      templateId: "legal:note",
      occurredAt: new Date().toISOString(),
      fields: { reason: "Revisión de contrato" },
    });
    expect(e.status).toBe(201);
    expect(e.body.encounter.template.id).toBe("legal:note");
  });
});
