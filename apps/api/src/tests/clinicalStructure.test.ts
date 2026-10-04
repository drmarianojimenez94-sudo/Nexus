import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dictado libre → la IA reparte el relato en las secciones. Se usa un doble
 * del transporte de IA que registra lo enviado y responde como lo haría el
 * modelo, para verificar el flujo completo y que no salgan datos del paciente.
 */
const sent: string[] = [];
const requestAI = vi.fn();
vi.mock("../lib/aiTransport.js", () => ({ requestAI }));
vi.mock("../lib/clinicalAssist.js", () => ({ isClinicalAiConfigured: () => true, suggestForCase: async () => null }));

const { createApp } = await import("../app.js");
const app = createApp();
let doctor: ReturnType<typeof request.agent>;

const DICTATION =
  "Bueno, Laura Fernández, DNI 28.456.789, viene porque le duele la garganta hace dos días y tuvo fiebre de 38.5, no tiene tos. " +
  "Es hipertensa, toma enalapril 10. La revisé: faringe eritematosa con exudado, adenopatías submaxilares dolorosas, 37.9 de temperatura. " +
  "Me parece una faringitis estreptocócica. Le indico amoxicilina 500 cada 8 horas por 10 días e ibuprofeno 400 si tiene dolor. Control en una semana.";

const aiSections = {
  reason: { value: "Odinofagia y fiebre", quotes: ["le duele la garganta"] },
  present: { value: "Odinofagia de 2 días de evolución con fiebre de 38,5 °C. Niega tos.", quotes: ["le duele la garganta hace dos días y tuvo fiebre de 38.5, no tiene tos"] },
  exam: { value: "Faringe eritematosa con exudado. Adenopatías submaxilares dolorosas. T 37,9 °C.", quotes: ["faringe eritematosa con exudado, adenopatías submaxilares dolorosas"] },
  assessment: { value: "Faringitis estreptocócica (presuntiva)", quotes: ["faringitis estreptocócica"] },
  treatment: { value: "Amoxicilina 500 mg c/8 h por 10 días. Ibuprofeno 400 mg si dolor.", quotes: ["amoxicilina 500 cada 8 horas por 10 días"] },
  observations: { value: "HTA en tratamiento con enalapril 10 mg. Control en una semana.", quotes: ["Control en una semana"] },
};

beforeEach(async () => {
  sent.length = 0;
  requestAI.mockReset();
  requestAI.mockImplementation(async (params: { messages: Array<{ content: string }> }) => {
    sent.push(params.messages[0]!.content);
    return { content: [{ type: "tool_use", input: aiSections }] };
  });
  doctor = request.agent(app);
  await doctor.post("/auth/register").send({ name: "Dr. Mariano", email: `ai-${Date.now()}-${Math.random()}@example.test`, password: "supersecret123" });
});

describe("dictado libre ordenado por la IA", () => {
  it("reparte el relato en secciones, incluido el examen físico, sin enviar identidad", async () => {
    const res = await doctor.post("/verticals/medicine/capture").send({ text: DICTATION, captureMode: "dictated", templateId: "visit" });
    expect(res.status).toBe(200);
    expect(res.body.structuredStatus).toBe("ai");
    expect(res.body.plan.structuredBy).toBe("ai");
    const record = res.body.plan.steps.find((s: { kind: string }) => s.kind === "create_record");
    const fields = Object.fromEntries(record.fields.map((f: { key: string; value: string }) => [f.key, f.value]));
    expect(fields.exam).toMatch(/Faringe eritematosa/);
    expect(fields.assessment).toMatch(/Faringitis/);
    expect(record.request.body.dictation).toBe("");
    // Cada campo trae la frase dictada de la que salió.
    expect(record.fields.find((f: { key: string }) => f.key === "exam").evidence[0].text).toMatch(/faringe eritematosa/);
    // La ficha sigue identificada por las reglas, sin pasar por la IA.
    expect(res.body.plan.subject.name).toBe("Laura Fernández");
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toMatch(/Laura|Fernández|28\.456\.789|28456789/);
  });

  it("si la IA falla, ordena con reglas y avisa", async () => {
    requestAI.mockRejectedValueOnce(new Error("timeout"));
    const res = await doctor.post("/verticals/medicine/capture").send({ text: DICTATION, captureMode: "dictated", templateId: "visit" });
    expect(res.status).toBe(200);
    expect(res.body.structuredStatus).toBe("error");
    expect(res.body.plan.structuredBy).toBe("rules");
    expect(res.body.plan.warnings[0]).toMatch(/La IA no respondió/);
  });

  it("ordena un dictado dentro de una consulta abierta con cualquier plantilla", async () => {
    const res = await doctor.post("/verticals/medicine/structure").send({
      text: DICTATION,
      sections: [
        { key: "reason", label: "Motivo de consulta" },
        { key: "exam", label: "Examen físico" },
        { key: "treatment", label: "Tratamiento" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.structuredStatus).toBe("ai");
    expect(res.body.fields).toEqual({ reason: aiSections.reason.value, exam: aiSections.exam.value, treatment: aiSections.treatment.value });
  });
});
