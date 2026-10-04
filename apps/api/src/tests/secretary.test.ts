import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedIntent } from "../lib/ai.js";
import type { ClinicalCase } from "../lib/clinicalAssist.js";

const interpretUtterance = vi.fn<(text: string, ctx: unknown) => Promise<ParsedIntent | null>>();
vi.mock("../lib/ai.js", () => ({ isAiConfigured: true, aiProvider: { interpretUtterance } }));
const suggestForCase = vi.fn<(c: ClinicalCase) => Promise<unknown>>();
vi.mock("../lib/clinicalAssist.js", () => ({ isClinicalAiConfigured: () => true, suggestForCase }));

const { createApp } = await import("../app.js");
const { prisma } = await import("../lib/prisma.js");
const app = createApp();
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  interpretUtterance.mockReset();
  suggestForCase.mockReset();
  agent = request.agent(app);
  await agent.post("/auth/register").send({ name: "Mariano", email: "sec@example.test", password: "supersecret123" });
});

const intent = (p: Partial<ParsedIntent>): ParsedIntent => ({ intent: "conversation", title: "", when: null, target: null, spokenReply: "Listo.", ...p });

describe("secretario", () => {
  it("navega a pacientes por voz", async () => {
    interpretUtterance.mockResolvedValue(intent({ intent: "navigate", target: "patient_capture", spokenReply: "Abriendo el dictado de pacientes." }));
    const res = await agent.post("/assistant/interpret").send({ text: "quiero cargar un paciente" });
    expect(res.body).toMatchObject({ navigateTo: "/patients/capture", speak: "Abriendo el dictado de pacientes." });
  });

  it("pone una alarma: recordatorio en Nexus y datos para la alarma del teléfono", async () => {
    interpretUtterance.mockResolvedValue(intent({ intent: "set_alarm", title: "Guardia", when: "2026-10-06T09:30:00.000Z", spokenReply: "Alarma a las 6:30." }));
    const res = await agent.post("/assistant/interpret").send({ text: "poneme una alarma a las 6:30 para la guardia" });
    expect(res.body.alarm).toEqual({ at: "2026-10-06T09:30:00.000Z", title: "Guardia" });
    expect(await prisma.reminder.count()).toBe(1);
  });

  it("redacta un mail sin enviarlo; sin Gmail conectado avisa qué falta", async () => {
    interpretUtterance.mockResolvedValue(
      intent({ intent: "send_email", emailTo: "secretaria@clinica.test", emailSubject: "Turnos", emailBody: "Hola, ¿me pasás los turnos del lunes?", spokenReply: "Te preparé el mail. ¿Lo envío?" }),
    );
    const res = await agent.post("/assistant/interpret").send({ text: "mandale un mail a la secretaria pidiendo los turnos" });
    expect(res.body.emailDraft).toMatchObject({ to: "secretaria@clinica.test", subject: "Turnos", connected: false });
    expect(res.body.emailDraft.confirmationToken).toBeUndefined();
    expect(res.body.speak).toMatch(/Conectá Google/);
  });

  it("al agendar devuelve el evento para copiarlo al calendario del teléfono", async () => {
    interpretUtterance.mockResolvedValue(intent({ intent: "create_event", title: "Ateneo", when: "2026-10-07T15:00:00.000Z", spokenReply: "Agendado." }));
    const res = await agent.post("/assistant/interpret").send({ text: "agendá ateneo el miércoles a las 12" });
    expect(res.body.event).toMatchObject({ title: "Ateneo", startAt: "2026-10-07T15:00:00.000Z", google: false });
  });
});

describe("asistencia clínica", () => {
  it("envía a la IA el caso sin identificadores y devuelve guías, prevención y sugerencias", async () => {
    suggestForCase.mockResolvedValue({ summary: "Caso", considerations: [], workup: [], treatmentOptions: [{ option: "Metformina", rationale: "", source: "ADA" }], followupChecks: [], redFlags: [], questions: [] });
    const p = await agent.post("/clinical/patients").send({ name: "Juan Pérez", document: "30123456", birthDate: "1970-01-15", sex: "M", phone: "11 5555 1234", history: "Juan Pérez tiene DBT2 hace 5 años" });
    const res = await agent.post("/verticals/medicine/assist").send({
      subjectId: p.body.patient.id,
      fields: { reason: "Control de diabetes de Juan Pérez", present: "HbA1c 8.2, llamarlo al 11 5555 1234", treatment: "metformina 850 mg" },
    });
    expect(res.status).toBe(200);
    const sent = JSON.stringify(suggestForCase.mock.calls[0]![0]);
    expect(sent).not.toMatch(/Juan|Pérez|30123456|5555/);
    expect(sent).toContain("HbA1c 8.2");
    expect(res.body.sent.age).toBeGreaterThan(50);
    expect(res.body.guidelines.map((g: { id: string }) => g.id)).toContain("diabetes2");
    expect(res.body.prevention.join(" ")).toMatch(/colorrectal/);
    expect(res.body.ai.treatmentOptions[0].option).toBe("Metformina");
    expect(res.body.aiStatus).toBe("ok");
    const audit = await prisma.auditLog.findFirst({ where: { action: "vertical.assist" } });
    expect(JSON.stringify(audit)).not.toContain("Pérez");
  });

  it("aprende la conducta al validar y la ofrece después", async () => {
    const p = await agent.post("/clinical/patients").send({ name: "Ana López" });
    const e = await agent.post(`/clinical/patients/${p.body.patient.id}/encounters`).send({
      clientId: crypto.randomUUID(),
      templateId: "visit",
      occurredAt: new Date().toISOString(),
      fields: { reason: "Odinofagia", assessment: "Faringitis estreptocócica", treatment: "Amoxicilina 500 mg c/8 h por 10 días" },
    });
    await agent.post(`/clinical/encounters/${e.body.encounter.id}/finalize`).send({ version: e.body.encounter.version, confirmed: true });
    await new Promise((r) => setTimeout(r, 300));
    const habits = await agent.get("/verticals/medicine/habits");
    expect(habits.body.habits[0]).toMatchObject({ key: "pharyngitis", treatments: [{ text: "Amoxicilina 500 mg c/8 h por 10 días", count: 1 }] });
    const assist = await agent.post("/verticals/medicine/assist").send({ fields: { reason: "faringitis" }, includeAi: false });
    expect(assist.body.habits[0].key).toBe("pharyngitis");
    const removed = await agent.delete("/verticals/medicine/habits/pharyngitis");
    expect(removed.body.habits).toEqual([]);
  });

  it("voz neural apagada: el cliente usa la voz del dispositivo", async () => {
    expect((await agent.get("/voice/status")).body).toEqual({ provider: "device", configured: false });
    expect((await agent.post("/voice/tts").send({ text: "Abriendo calendario" })).status).toBe(501);
  });
});
