import { describe, expect, it } from "vitest";
import { joinTranscript } from "./dictation";
import { clinicalCaptureUrl, isClinicalDictation } from "../components/GlobalMicButton";

describe("dictado continuo", () => {
  it("une fragmentos sin duplicar espacios ni separar la puntuación", () => {
    expect(joinTranscript(["Motivo de consulta: tos ", " de tres días", ". Tratamiento:", "amoxicilina"])).toBe(
      "Motivo de consulta: tos de tres días. Tratamiento: amoxicilina",
    );
    expect(joinTranscript(["", "  "])).toBe("");
  });

  it("lo clínico va a la ficha; lo demás, al secretario", () => {
    expect(isClinicalDictation("Paciente Juan Pérez con dolor de pecho", "/today")).toBe(true);
    expect(isClinicalDictation("agendame ateneo el jueves a las 10", "/today")).toBe(false);
    expect(isClinicalDictation("control en dos semanas", "/patients/0b5c7e5e-2f5a-4f3b-9d1a-2a3b4c5d6e7f")).toBe(true);
  });

  it("dicta en la ficha abierta cuando estás en un paciente", () => {
    expect(clinicalCaptureUrl("/patients/0b5c7e5e-2f5a-4f3b-9d1a-2a3b4c5d6e7f")).toBe("/patients/capture?auto=1&patient=0b5c7e5e-2f5a-4f3b-9d1a-2a3b4c5d6e7f");
    expect(clinicalCaptureUrl("/today")).toBe("/patients/capture?auto=1");
  });
});
