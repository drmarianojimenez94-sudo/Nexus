import { describe, expect, it } from "vitest";
import {
  ageFrom,
  deidentify,
  habitsFor,
  interpretCapture,
  learnHabit,
  matchGuidelines,
  medicineVertical,
  preventiveReminders,
  recordStoreAdapter,
} from "./index";

describe("desidentificación antes de la IA", () => {
  it("quita nombre, documento, teléfono, correo, fechas y otros nombres; conserva lo clínico", () => {
    const { text, replaced } = deidentify(
      "Paciente Juan Pérez, DNI 30.123.456, tel 11 5555-1234, juan@mail.com. Consulta por cefalea desde el 12/09/2026. Vino con su esposa Laura. TA 150/95, toma enalapril 10 mg.",
      { names: ["Juan Pérez"], documents: ["30123456"], phones: ["1155551234"] },
    );
    expect(text).not.toMatch(/Juan|Pérez|30\.?123|5555|juan@|12\/09|Laura/);
    expect(text).toContain("cefalea");
    expect(text).toContain("TA 150/95");
    expect(text).toContain("enalapril 10 mg");
    expect(replaced).toEqual(expect.arrayContaining(["nombre", "documento", "teléfono", "correo", "fecha", "otro nombre"]));
  });

  it("no rompe términos clínicos con mayúscula ni acrónimos", () => {
    const { text } = deidentify("Control de HTA. Motivo de consulta: tos. Tratamiento: amoxicilina. Observaciones: buen estado.");
    expect(text).toBe("Control de HTA. Motivo de consulta: tos. Tratamiento: amoxicilina. Observaciones: buen estado.");
  });

  it("calcula la edad sin exponer la fecha", () => {
    expect(ageFrom("1980-10-05", new Date("2026-10-04T12:00:00Z"))).toBe(45);
    expect(ageFrom("")).toBeNull();
  });
});

describe("recordatorios por guías", () => {
  it("detecta condiciones y devuelve controles con su fuente", () => {
    const ids = matchGuidelines("Paciente con DBT2 e HTA, HbA1c 8.1").map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(["diabetes2", "hypertension"]));
    const dbt = matchGuidelines("diabetes tipo 2")[0]!;
    expect(dbt.checks.join(" ")).toMatch(/Fondo de ojo/);
    expect(dbt.sources.length).toBeGreaterThan(0);
  });

  it("agrega prevención por edad y sexo", () => {
    expect(preventiveReminders(55, "F").join(" ")).toMatch(/Mamografía/);
    expect(preventiveReminders(55, "M").join(" ")).not.toMatch(/Mamografía/);
    expect(preventiveReminders(null, "F")).toEqual([]);
  });
});

describe("cerebro: conductas aprendidas", () => {
  it("aprende y ordena por frecuencia lo que el profesional indica en cada cuadro", () => {
    let habits = learnHabit([], { assessment: "Faringitis estreptocócica", treatment: "amoxicilina 500 mg c/8 h por 10 días" });
    habits = learnHabit(habits, { assessment: "faringitis", treatment: "Amoxicilina 500 mg c/8 h por 10 días" });
    habits = learnHabit(habits, { assessment: "faringitis", treatment: "azitromicina 500 mg/día 5 días" });
    const faringitis = habitsFor(habits, "odinofagia, probable faringitis")[0]!;
    expect(faringitis.key).toBe("pharyngitis");
    expect(faringitis.treatments[0]).toMatchObject({ count: 2 });
    expect(faringitis.treatments).toHaveLength(2);
  });

  it("ignora conductas vacías", () => {
    expect(learnHabit([], { assessment: "x", treatment: "" })).toEqual([]);
  });
});

describe("consulta dictada", () => {
  it("separa motivo, enfermedad actual, tratamiento y observaciones", () => {
    const plan = interpretCapture(
      "Paciente nuevo Juan Pérez. Motivo de consulta: tos y fiebre. Enfermedad actual: tos productiva de 4 días con fiebre de 38. Tratamiento: amoxicilina 500 mg cada 8 horas. Observaciones: vive solo, controlar adherencia.",
      medicineVertical,
      recordStoreAdapter,
      { now: new Date("2026-10-05T12:00:00Z"), templateId: "visit" },
    );
    const fields = Object.fromEntries(plan.steps.find((s) => s.kind === "create_record")!.fields!.map((f) => [f.key, f.value]));
    expect(plan.templateId).toBe("visit");
    expect(fields.reason).toBe("tos y fiebre");
    expect(fields.present).toContain("tos productiva de 4 días");
    expect(fields.treatment).toContain("amoxicilina 500 mg");
    expect(fields.observations).toContain("vive solo");
  });
});
