import type { GoldenCase } from "../../manifest";

/**
 * Casos de referencia (fecha fija: lunes 5/10/2026, 09:00 en Buenos Aires).
 * Cada caso fija lo que el intérprete debe extraer y lo que nunca debe
 * inventar. Agregar un caso cada vez que se corrige un error real.
 */
export const MEDICINE_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "new-patient-headache",
    utterance: "Paciente nuevo Juan Pérez, DNI 30.123.456, 45 años, consulta por cefalea de 3 días, niega fiebre, TA 150/95. Le indico ibuprofeno 400 mg cada 8 horas. Control en 2 semanas.",
    expect: {
      subjectName: "Juan Perez",
      document: "30123456",
      templateId: "first",
      fields: { reason: "cefalea de 3 días", vitals: "TA 150/95", plan: "ibuprofeno 400 mg" },
      followups: [{ kind: "CONTROL", inDays: 14 }],
      negated: ["fiebre"],
      medications: [{ name: "ibuprofeno", flagged: false }],
      redFlags: [],
      mustNotContain: ["migraña", "diagnóstico"],
    },
  },
  {
    id: "existing-control-hta",
    utterance: "Paciente Marta Gómez viene a control de hipertensión. TA 130/80, FC 72. Continúa con enalapril 10 mg cada 12 horas. Próximo control en 3 meses.",
    expect: {
      subjectName: "Marta Gomez",
      templateId: "chronic",
      fields: { vitals: "TA 130/80", plan: "enalapril 10 mg" },
      followups: [{ kind: "CONTROL", inDays: 92 }],
      medications: [{ name: "enalapril", flagged: false }],
      redFlags: [],
    },
  },
  {
    id: "chest-pain-flag",
    utterance: "Paciente Carlos Ruiz consulta por dolor de pecho opresivo desde hace una hora, irradiado a brazo izquierdo.",
    expect: { subjectName: "Carlos Ruiz", fields: { subjective: "dolor de pecho opresivo" }, redFlags: ["chest_pain"], followups: [] },
  },
  {
    id: "negated-chest-pain",
    utterance: "Paciente Lucía Sosa refiere palpitaciones aisladas, niega dolor torácico, disnea ni síncope.",
    expect: { subjectName: "Lucia Sosa", negated: ["dolor toracico", "sincope"], redFlags: [], fields: { subjective: "palpitaciones" } },
  },
  {
    id: "call-friday-results",
    utterance: "Paciente Pedro Díaz, pido laboratorio con hemograma y glucemia. Llamarlo el viernes con los resultados.",
    expect: { subjectName: "Pedro Diaz", followups: [{ kind: "RESULT", inDays: 7 }, { kind: "CALL", inDays: 4 }] },
  },
  {
    id: "appointment-tomorrow",
    utterance: "Turno para la paciente Ana López mañana a las 10 y media.",
    expect: { appointmentAt: "2026-10-06T10:30", followups: [] },
  },
  {
    id: "appointment-weekday-afternoon",
    utterance: "Agendame un turno con el paciente Raúl Benítez el jueves a las 5 de la tarde.",
    expect: { appointmentAt: "2026-10-08T17:00" },
  },
  {
    id: "overdose-flag",
    utterance: "Paciente Sofía Romero, faringitis. Indico amoxicilina 3 g cada 8 horas.",
    expect: { subjectName: "Sofia Romero", medications: [{ name: "amoxicilina", flagged: true }] },
  },
  {
    id: "wrong-unit-flag",
    utterance: "Paciente Diego Torres, hipotiroidismo. Indico levotiroxina 100 mg en ayunas.",
    expect: { medications: [{ name: "levotiroxina", flagged: true }] },
  },
  {
    id: "missing-dose-flag",
    utterance: "Paciente Elena Vera con lumbalgia. Indico diclofenac y reposo relativo.",
    expect: { medications: [{ name: "diclofenac", flagged: true }] },
  },
  {
    id: "allergy-conflict",
    utterance: "Paciente nueva Rosa Medina, alérgica a la penicilina. Consulta por otitis. Indico amoxicilina 500 mg cada 8 horas.",
    expect: { subjectName: "Rosa Medina", templateId: "first", medications: [{ name: "amoxicilina", flagged: false }], allergyConflicts: ["amoxicilina"], fields: { reason: "otitis" } },
  },
  {
    id: "stroke-flag",
    utterance: "Paciente Jorge Castro, esposa refiere que desde las 8 tiene la boca torcida y dificultad para hablar.",
    expect: { redFlags: ["stroke"] },
  },
  {
    id: "suicide-flag",
    utterance: "Paciente Martín Ibarra, control de depresión. Refiere ideas de muerte en la última semana.",
    expect: { redFlags: ["suicide_risk"] },
  },
  {
    id: "hypertensive-crisis",
    utterance: "Paciente Norma Paz, TA 190/115, cefalea leve. Repetir medición.",
    expect: { redFlags: ["hypertensive_crisis"], fields: { objective: "TA 190/115" } },
  },
  {
    id: "emergency-template",
    utterance: "Guardia: paciente Tomás Gil ingresa por fiebre de 38.5 y tos. Sat 96%. Impresión diagnóstica: neumonía. Pautas de alarma explicadas.",
    expect: { subjectName: "Tomas Gil", templateId: "emergency", fields: { vitals: "Sat O2 96", assessment: "neumonía" }, redFlags: [] },
  },
  {
    id: "referral-template",
    utterance: "Paciente Laura Ríos, derivo a cardiología por soplo sistólico. Interconsulta con prioridad habitual.",
    expect: { subjectName: "Laura Rios", templateId: "referral" },
  },
  {
    id: "soap-template",
    utterance: "Nota SOAP paciente Hugo Méndez. Refiere dolor de garganta. Al examen faringe eritematosa. Impresiona faringitis viral. Indico paracetamol 1 g cada 8 horas.",
    expect: {
      subjectName: "Hugo Mendez",
      templateId: "soap",
      fields: { subjective: "dolor de garganta", objective: "faringe eritematosa", assessment: "faringitis viral", plan: "paracetamol 1 g" },
      medications: [{ name: "paracetamol", flagged: false }],
    },
  },
  {
    id: "no-subject",
    utterance: "Control en una semana y llamar a la farmacia.",
    expect: { followups: [{ kind: "CALL", inDays: 7 }, { kind: "CONTROL", inDays: 7 }] },
  },
  {
    id: "phone-capture",
    utterance: "Paciente nuevo Pablo Acosta, teléfono 11 5555 1234, consulta por dolor lumbar.",
    expect: { subjectName: "Pablo Acosta", fields: { reason: "dolor lumbar" } },
  },
  {
    id: "unknown-drug",
    utterance: "Paciente Irma Luna, insomnio. Indico mirtazapina 15 mg a la noche.",
    expect: { medications: [{ name: "mirtazapina", flagged: true }] },
  },
  {
    id: "hypoglycemia",
    utterance: "Paciente Oscar Funes diabético, glucemia 52, sudoroso.",
    expect: { subjectName: "Oscar Funes", redFlags: ["hypoglycemia"], fields: { objective: "Glucemia 52" } },
  },
  {
    id: "date-numeric",
    utterance: "Paciente Clara Núñez, control el 20/10 con ecografía.",
    expect: { followups: [{ kind: "CONTROL", inDays: 15 }] },
  },
  {
    id: "negated-fever-not-flag",
    utterance: "Paciente Bruno Vega, odinofagia, sin fiebre, sin rigidez de nuca.",
    expect: { negated: ["fiebre", "rigidez de nuca"], redFlags: [] },
  },
  {
    id: "violence",
    utterance: "Paciente Daniela Ferreyra refiere que su pareja la golpea. Equimosis en brazos.",
    expect: { redFlags: ["violence"] },
  },
];
