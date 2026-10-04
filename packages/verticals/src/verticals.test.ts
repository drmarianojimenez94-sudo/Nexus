import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLINICAL_TEMPLATES } from "@nexus/shared";
import {
  applyNativePermissions,
  buildDayBrief,
  consistencyProblems,
  evaluateVertical,
  executePlan,
  interpretCapture,
  medicineVertical,
  nativePermissions,
  PlanExecutionError,
  assignSubject,
  recordStoreAdapter,
  resolveWhen,
  fold,
  looksSensitive,
  scoreVertical,
  verticalManifestSchema,
  VERTICALS,
  verticalTemplate,
  type ApiRequest,
} from "./index";
import { scaffoldManifest } from "./scaffold";

const NOW = new Date("2026-10-05T12:00:00.000Z"); // lunes 09:00 en Buenos Aires
const TZ = "America/Argentina/Buenos_Aires";
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const capture = (text: string, extra: Partial<Parameters<typeof interpretCapture>[3]> = {}) =>
  interpretCapture(text, medicineVertical, recordStoreAdapter, { now: NOW, random, ...extra });

describe("fábrica de verticales", () => {
  it("todas las verticales registradas validan el esquema y son coherentes", () => {
    for (const { manifest } of Object.values(VERTICALS)) {
      expect(() => verticalManifestSchema.parse(manifest)).not.toThrow();
      expect(consistencyProblems(manifest)).toEqual([]);
    }
  });

  it("la vertical médica aprueba la rúbrica con ≥ 90 y sin fallas de compuerta", () => {
    const evaluation = evaluateVertical(medicineVertical, recordStoreAdapter);
    const card = scoreVertical(medicineVertical, evaluation);
    expect(evaluation.majorErrors).toBe(0);
    expect(evaluation.evidenceCoverage).toBe(1);
    expect(card.gateFailures).toEqual([]);
    expect(card.score).toBeGreaterThanOrEqual(90);
    expect(card.passed).toBe(true);
    expect(card.dimensions.reduce((s, d) => s + d.weight, 0)).toBe(100);
  });

  it("una vertical recién generada valida pero no aprueba hasta completarla", () => {
    const manifest = verticalManifestSchema.parse(
      scaffoldManifest({ id: "arquitectura", name: "Nexus Arquitectura", profession: "Arquitecto/a", subject: { singular: "cliente", plural: "clientes" }, record: { singular: "visita", plural: "visitas" } }),
    );
    expect(consistencyProblems(manifest)).toEqual([]);
    const card = scoreVertical(manifest, evaluateVertical(manifest, recordStoreAdapter));
    expect(card.passed).toBe(false);
    expect(card.score).toBeGreaterThan(50);
  });

  it("las plantillas médicas son exactamente las que valida la API", () => {
    expect(medicineVertical.templates.map((t) => t.id)).toEqual(CLINICAL_TEMPLATES.map((t) => t.id));
    for (const t of medicineVertical.templates) {
      const api = CLINICAL_TEMPLATES.find((x) => x.id === t.id)!;
      expect(t.sections.map((s) => s.key)).toEqual(api.fields.map((f) => f.key));
    }
  });

  it("expone plantillas de otras verticales con id `vertical:plantilla`", () => {
    expect(verticalTemplate("legal:note")?.fields.length).toBeGreaterThan(0);
    expect(verticalTemplate("medicine")).toBeUndefined();
    expect(verticalTemplate("inexistente:note")).toBeUndefined();
  });
});

describe("regresión: casos que fueron ciegos (escritos sin ver el código)", () => {
  it.each(["heldout.json", "heldout2.json", "heldout3.json", "heldout4.json"])("%s sin errores mayores", (file) => {
    const cases = JSON.parse(readFileSync(join(__dirname, "verticals/medicine", file), "utf8"));
    const report = evaluateVertical({ ...medicineVertical, evaluation: { ...medicineVertical.evaluation, goldenCases: cases } }, recordStoreAdapter);
    expect(report.results.filter((r) => r.errors.some((e) => e.severity === "major"))).toEqual([]);
    expect(report.passRate).toBeGreaterThanOrEqual(0.95);
  });
});

describe("fechas en español", () => {
  const when = (text: string) => resolveWhen(text, fold(text), NOW, TZ);
  it.each([
    ["mañana a las 10", "2026-10-06T13:00:00.000Z"],
    ["pasado mañana", "2026-10-07T12:00:00.000Z"],
    ["el viernes a las 18:30", "2026-10-09T21:30:00.000Z"],
    ["el lunes", "2026-10-12T12:00:00.000Z"],
    ["en dos semanas", "2026-10-19T12:00:00.000Z"],
    ["dentro de 10 días", "2026-10-15T12:00:00.000Z"],
    ["el 3 de noviembre", "2026-11-03T12:00:00.000Z"],
    ["el 20/10 a las 8 y media", "2026-10-20T11:30:00.000Z"],
    ["hoy a las 5 de la tarde", "2026-10-05T20:00:00.000Z"],
  ])("%s", (text, iso) => {
    expect(when(text)?.at.toISOString()).toBe(iso);
  });
  it("no confunde «de la mañana» con mañana", () => {
    expect(when("a las 10 de la mañana")).toBeNull();
  });
});

describe("captura clínica", () => {
  it("convierte un dictado en un plan revisable con evidencia, sin escribir nada", () => {
    const plan = capture("Paciente nuevo Juan Pérez, DNI 30.123.456, consulta por cefalea, niega fiebre, TA 150/95. Le indico ibuprofeno 400 mg cada 8 horas. Control en 2 semanas.");
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.steps.map((s) => s.kind)).toEqual(["create_subject", "create_record", "create_followup"]);
    const record = plan.steps[1]!;
    expect(record.request.path).toBe("/clinical/patients/:subjectId/encounters");
    expect(record.bind).toEqual({ "path.:subjectId": `$${plan.steps[0]!.id}` });
    expect(record.request.body?.dictation).toContain("Juan Pérez");
    for (const f of record.fields!) {
      expect(f.requiresReview).toBe(true);
      for (const e of f.evidence) expect(plan.transcript.slice(e.start, e.end)).toBe(e.text);
    }
    expect(plan.steps[2]!.request.body).toMatchObject({ kind: "CONTROL", dueAt: "2026-10-19T12:00:00.000Z" });
  });

  it("nunca completa dosis ni diagnósticos que no se dijeron", () => {
    const plan = capture("Paciente Elena Vera con lumbalgia. Indico diclofenac.");
    const text = JSON.stringify(plan.steps);
    expect(text).not.toMatch(/\d+\s*mg/);
    expect(plan.warnings.join(" ")).toMatch(/dosis no especificada/);
  });

  it("marca el diagnóstico como presuntivo", () => {
    const plan = capture("Paciente Hugo Méndez. Impresiona faringitis viral.");
    const field = plan.steps.find((s) => s.kind === "create_record")!.fields!.find((f) => f.key === "assessment")!;
    expect(field.provisional).toBe(true);
    expect(plan.steps.find((s) => s.kind === "create_record")!.warnings.join()).toMatch(/presuntiva/);
  });

  it("asocia a la ficha abierta sin buscarla ni crearla", () => {
    const plan = capture("Control en una semana.", { subjectId: "11111111-1111-4111-8111-111111111111" });
    expect(plan.steps).toHaveLength(2);
    const fu = plan.steps.find((s) => s.kind === "create_followup")!;
    expect(fu.request.body?.patientId).toBe("11111111-1111-4111-8111-111111111111");
    expect(fu.bind).toEqual({});
    const rec = plan.steps.find((s) => s.kind === "create_record")!;
    expect(rec.request.path).toBe("/clinical/patients/11111111-1111-4111-8111-111111111111/encounters");
  });

  it("sin paciente identificado pide elegir la ficha", () => {
    const plan = capture("Control en una semana.");
    expect(plan.subject.mode).toBe("missing");
    expect(plan.warnings.join()).toMatch(/elegí la ficha/i);
    for (const step of plan.steps) expect(Object.values(step.bind ?? {})).toEqual(["$subject"]);
    const assigned = assignSubject(plan.steps, "22222222-2222-4222-8222-222222222222");
    expect(assigned.find((s) => s.kind === "create_record")!.request.path).toBe("/clinical/patients/22222222-2222-4222-8222-222222222222/encounters");
    expect(assigned.find((s) => s.kind === "create_followup")!.request.body?.patientId).toBe("22222222-2222-4222-8222-222222222222");
    expect(assigned.every((s) => Object.keys(s.bind ?? {}).length === 0)).toBe(true);
  });

  it("el turno lleva solo iniciales y no busca la ficha", () => {
    const plan = capture("Turno para la paciente Ana López mañana a las 10 y media.");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.request.body).toMatchObject({ title: "Turno · A. L.", startAt: "2026-10-06T13:30:00.000Z" });
  });

  it("detecta señales de alarma pero no las negadas", () => {
    expect(capture("Paciente Carlos Ruiz con dolor de pecho opresivo.").safety.redFlags.filter((r) => !r.negated).map((r) => r.id)).toEqual(["chest_pain"]);
    expect(capture("Paciente Lucía Sosa niega dolor torácico.").safety.redFlags.every((r) => r.negated)).toBe(true);
  });

  it("cruza alergias conocidas de la ficha con lo indicado", () => {
    const plan = capture("Indico amoxicilina 500 mg cada 8 horas.", { subjectId: "11111111-1111-4111-8111-111111111111", knownAllergies: ["Penicilina"] });
    expect(plan.safety.allergyConflicts.map((c) => c.medication)).toEqual(["amoxicilina"]);
    expect(plan.warnings.join()).toMatch(/conflicto/);
  });
});

describe("datos sensibles", () => {
  it.each([
    ["Paciente Juan Pérez con dolor de pecho", true],
    ["paciente Ana López, TA 150/90", true],
    ["DNI 30.123.456", true],
    ["la paciente de las 10 necesita control en una semana", true],
    ["recordame comprar café mañana", false],
    ["reunión con el paciente equipo de marketing", false],
    ["llevame al calendario", false],
  ])("%s → %s", (text, expected) => {
    expect(looksSensitive(text, medicineVertical)).toBe(expected);
  });
});

describe("ejecución del plan", () => {
  it("ejecuta en orden, resuelve dependencias y respeta la selección", async () => {
    const plan = capture("Paciente nuevo Juan Pérez consulta por tos. Control en 2 semanas.");
    const calls: ApiRequest[] = [];
    const fetcher = async (r: ApiRequest) => {
      calls.push(r);
      if (r.path === "/clinical/patients") return { patient: { id: "p1" } };
      if (r.path.endsWith("/encounters")) return { encounter: { id: "e1" } };
      return { followup: { id: "f1" } };
    };
    const done = await executePlan(plan.steps, fetcher, plan.steps.filter((s) => s.kind !== "create_followup").map((s) => s.id));
    expect(Object.values(done)).toEqual(["p1", "e1"]);
    expect(calls.map((c) => c.path)).toEqual(["/clinical/patients", "/clinical/patients/p1/encounters"]);
  });

  it("no ejecuta pasos cuyo paciente no fue confirmado", async () => {
    const plan = capture("Paciente nuevo Juan Pérez consulta por tos.");
    const record = plan.steps.find((s) => s.kind === "create_record")!;
    await expect(executePlan(plan.steps, async () => ({}), [record.id])).rejects.toMatchObject({ code: "missing_dependency" });
  });

  it("una búsqueda ambigua se detiene y devuelve candidatos", async () => {
    const plan = capture("Paciente Ana Gómez consulta por tos.");
    const err = await executePlan(plan.steps, async () => ({ patients: [{ id: "a" }, { id: "b" }] })).catch((e) => e);
    expect(err).toBeInstanceOf(PlanExecutionError);
    expect(err.code).toBe("ambiguous_subject");
    expect(err.candidates).toHaveLength(2);
  });
});

describe("Mi día", () => {
  it("ordena prioridades: vencidos, resultados, borradores y huecos", () => {
    const brief = buildDayBrief(medicineVertical, {
      now: NOW,
      appointments: [
        { id: "a1", title: "Turno · J. P.", startAt: "2026-10-05T13:00:00.000Z", endAt: "2026-10-05T13:30:00.000Z" },
        { id: "a2", title: "Turno · M. G.", startAt: "2026-10-05T17:00:00.000Z", endAt: "2026-10-05T17:30:00.000Z" },
        { id: "x", title: "Mañana", startAt: "2026-10-06T13:00:00.000Z" },
      ],
      followups: [
        { id: "f1", title: "Llamar con resultados", dueAt: "2026-10-01T12:00:00.000Z", kind: "CALL", subjectId: "p1", subjectName: "Pedro Díaz" },
        { id: "f2", title: "Revisar laboratorio", dueAt: "2026-10-05T15:00:00.000Z", kind: "RESULT", subjectId: "p2", subjectName: "Ana López" },
        { id: "f3", title: "Control", dueAt: "2026-10-08T12:00:00.000Z", kind: "CONTROL", subjectId: "p3", subjectName: "Rosa Medina" },
      ],
      drafts: [{ id: "d1", subjectId: "p4", subjectName: "Hugo Méndez", updatedAt: "2026-10-03T12:00:00.000Z" }],
    });
    expect(brief.appointments.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(brief.next?.id).toBe("a1");
    expect(brief.overdue.map((f) => f.id)).toEqual(["f1"]);
    expect(brief.overdue[0]!.daysLate).toBe(4);
    expect(brief.dueToday.map((f) => f.id)).toEqual(["f2"]);
    expect(brief.upcoming.map((f) => f.id)).toEqual(["f3"]);
    expect(brief.suggestions.map((s) => s.id)).toEqual(expect.arrayContaining(["overdue-followups", "results-to-review", "calls-today", "stale-drafts", "free-slot", "next-appointment"]));
    expect(brief.suggestions[0]!.priority).toBe(1);
    expect(brief.freeSlots.slice(0, 2)).toEqual([
      { start: "2026-10-05T12:00:00.000Z", end: "2026-10-05T13:00:00.000Z", minutes: 60 },
      { start: "2026-10-05T13:30:00.000Z", end: "2026-10-05T17:00:00.000Z", minutes: 210 },
    ]);
    expect(brief.spoken).toMatch(/2 turnos/);
  });
});

describe("permisos nativos", () => {
  it("se derivan del manifiesto: solo capacidades implementadas, con justificación", () => {
    const native = nativePermissions(medicineVertical);
    expect(native.androidPermissions).toEqual([
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.READ_CALENDAR",
      "android.permission.READ_CONTACTS",
      "android.permission.RECORD_AUDIO",
      "android.permission.USE_BIOMETRIC",
      "android.permission.WRITE_CALENDAR",
      "com.android.alarm.permission.SET_ALARM",
    ]);
    expect(native.planned).toEqual(expect.arrayContaining(["camera", "photos"]));
    expect(native.planned).not.toContain("calendar");
    const calendar = native.plugins.find((p) => Array.isArray(p) && p[0] === "expo-calendar") as [string, Record<string, string>];
    expect(calendar[1].calendarPermission).toMatch(/calendario/);
    expect(calendar[1].remindersPermission).toMatch(/Recordatorios/);
    const speech = native.plugins.find((p) => Array.isArray(p) && p[0] === "expo-speech-recognition") as [string, Record<string, string>];
    expect(speech[1].microphonePermission).toMatch(/micrófono/);
  });

  it("apps/mobile/app.json está sincronizado con el manifiesto", () => {
    const appJson = JSON.parse(readFileSync(join(__dirname, "../../../apps/mobile/app.json"), "utf8"));
    expect(applyNativePermissions(appJson, medicineVertical)).toEqual(appJson);
  });

  it("cada capacidad implementada tiene su dependencia instalada en la app nativa", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../../apps/mobile/package.json"), "utf8"));
    for (const c of medicineVertical.capabilities.filter((x) => x.status === "implemented")) expect(pkg.dependencies[c.expoPlugin!.name]).toBeDefined();
  });
});
