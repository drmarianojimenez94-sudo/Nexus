import { z } from "zod";

const text = z.string().trim().max(10000).default("");
export const patientInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().max(40).default(""),
  birthDate: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v &&
          v <= new Date().toISOString().slice(0, 10)),
      "Fecha de nacimiento inválida",
    )
    .default(""),
  phone: z.string().trim().max(80).default(""),
  allergies: text,
  medication: text,
  history: text,
});
export type PatientInput = z.infer<typeof patientInputSchema>;
export type Patient = PatientInput & {
  id: string;
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export interface ClinicalField {
  key: string;
  label: string;
}
export interface ClinicalTemplate {
  id: string;
  name: string;
  description: string;
  version: number;
  fields: ClinicalField[];
  revision?: number;
  archived?: boolean;
  favorite?: boolean;
  builtin?: boolean;
  lineageId?: string;
  previousVersionId?: string | null;
}
const fields = (pairs: string[][]): ClinicalField[] =>
  pairs.map(([key, label]) => ({ key: key!, label: label! }));
export const CLINICAL_TEMPLATES: ClinicalTemplate[] = [
  {
    id: "first",
    name: "Primera consulta",
    description: "Evaluación inicial de consultorio",
    version: 1,
    fields: fields([
      ["reason", "Motivo de consulta"],
      ["present", "Enfermedad actual"],
      ["history", "Antecedentes relevantes"],
      ["vitals", "Signos vitales y unidades"],
      ["exam", "Examen físico"],
      ["assessment", "Evaluación / impresión diagnóstica"],
      ["plan", "Plan y tratamiento"],
      ["warnings", "Pautas de alarma"],
      ["followup", "Seguimiento"],
    ]),
  },
  {
    id: "progress",
    name: "Evolución breve",
    description: "Control y cambios desde la última atención",
    version: 1,
    fields: fields([
      ["subjective", "Síntomas y evolución"],
      ["objective", "Hallazgos / estudios"],
      ["assessment", "Evaluación"],
      ["plan", "Conducta"],
      ["followup", "Próximo control"],
    ]),
  },
  {
    id: "emergency",
    name: "Guardia",
    description: "Evaluación, intervenciones y reevaluación",
    version: 1,
    fields: fields([
      ["reason", "Motivo e inicio del cuadro"],
      ["initial", "Evaluación inicial"],
      ["vitals", "Signos vitales y unidades"],
      ["exam", "Examen físico"],
      ["tests", "Estudios solicitados y resultados"],
      ["assessment", "Evaluación"],
      ["interventions", "Intervenciones y horarios"],
      ["reevaluation", "Reevaluación"],
      ["destination", "Destino / alta / derivación"],
      ["warnings", "Pautas de alarma y seguimiento"],
    ]),
  },
  {
    id: "chronic",
    name: "Control de enfermedad crónica",
    description: "Seguimiento longitudinal",
    version: 1,
    fields: fields([
      ["problems", "Problemas en seguimiento"],
      ["evolution", "Evolución y adherencia"],
      ["vitals", "Signos vitales y unidades"],
      ["tests", "Estudios / resultados con fecha"],
      ["assessment", "Evaluación"],
      ["plan", "Tratamiento y objetivos"],
      ["followup", "Próximo control"],
    ]),
  },
  {
    id: "referral",
    name: "Interconsulta / derivación",
    description: "Resumen y pregunta al especialista",
    version: 1,
    fields: fields([
      ["destination", "Profesional / servicio destinatario"],
      ["reason", "Motivo de derivación"],
      ["summary", "Resumen clínico"],
      ["tests", "Estudios relevantes"],
      ["question", "Pregunta al especialista"],
      ["priority", "Prioridad indicada por el médico"],
    ]),
  },
  {
    id: "instructions",
    name: "Indicaciones al paciente",
    description: "Instrucciones revisadas por el médico",
    version: 1,
    fields: fields([
      ["instructions", "Indicaciones"],
      ["treatment", "Tratamiento indicado"],
      ["warnings", "Pautas de alarma"],
      ["followup", "Controles y estudios"],
    ]),
  },
];
export const templateInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).default(""),
  fields: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
        label: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(30)
    .refine(
      (fs) => new Set(fs.map((f) => f.key)).size === fs.length,
      "Campos duplicados",
    ),
});
export const templateCreateSchema = templateInputSchema.extend({
  clientId: z.string().uuid().optional(),
});
export const templateVersionSchema = templateInputSchema.extend({
  revision: z.number().int().min(1),
  clientId: z.string().uuid(),
});
export const templateMetadataSchema = z
  .object({
    revision: z.number().int().min(1),
    archived: z.boolean().optional(),
    favorite: z.boolean().optional(),
  })
  .refine(
    (v) => v.archived !== undefined || v.favorite !== undefined,
    "Indicá un cambio",
  );
export const encounterInputSchema = z.object({
  templateId: z.string().min(1).max(100),
  occurredAt: z.string().datetime(),
  fields: z
    .record(z.string().max(10000))
    .refine((f) => Object.keys(f).length <= 30)
    .default({}),
  dictation: z.string().max(40000).default(""),
});
export type EncounterInput = z.infer<typeof encounterInputSchema>;
export type ClinicalEncounter = EncounterInput & {
  id: string;
  patientId: string;
  template: ClinicalTemplate;
  status: "DRAFT" | "FINAL";
  version: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  patientSnapshot?: PatientInput & { id: string };
  clinicianSnapshot?: { id: string; name: string; email: string };
};
export const followupInputSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  dueAt: z.string().datetime(),
  kind: z.enum(["CONTROL", "RESULT", "CALL"]).default("CONTROL"),
});
export interface ClinicalFollowup {
  id: string;
  version: number;
  patientId: string;
  title: string;
  dueAt: string;
  kind: "CONTROL" | "RESULT" | "CALL";
  status: "PENDING" | "DONE";
  patientName: string;
}
