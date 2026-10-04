import { z } from "zod";
import { env } from "./env.js";
import { requestAI } from "./aiTransport.js";

export const clinicalSuggestionsSchema = z.object({
  summary: z.string().max(600).default(""),
  considerations: z.array(z.string().max(300)).max(8).default([]),
  workup: z.array(z.string().max(300)).max(8).default([]),
  treatmentOptions: z
    .array(z.object({ option: z.string().max(300), rationale: z.string().max(400).default(""), source: z.string().max(160).default("") }))
    .max(6)
    .default([]),
  followupChecks: z.array(z.string().max(300)).max(8).default([]),
  redFlags: z.array(z.string().max(300)).max(6).default([]),
  questions: z.array(z.string().max(300)).max(6).default([]),
});
export type ClinicalSuggestions = z.infer<typeof clinicalSuggestionsSchema>;

export const isClinicalAiConfigured = () => Boolean(env.aiApiKey);

export interface ClinicalCase {
  age: number | null;
  sex: string;
  allergies: string;
  medication: string;
  history: string;
  /** Campos de la consulta, ya desidentificados. */
  fields: Record<string, string>;
  /** Conductas habituales del profesional para estos cuadros. */
  habits: string[];
}

const LIST = { type: "array", items: { type: "string" } } as const;

/**
 * Sugerencias para el médico tratante sobre un caso desidentificado. Usa el
 * mismo transporte que el resto de la IA (Gemini hoy, Claude con
 * AI_PROVIDER=anthropic). Nunca recibe nombre, documento, teléfono ni fechas.
 */
export async function suggestForCase(c: ClinicalCase): Promise<ClinicalSuggestions | null> {
  if (!env.aiApiKey) return null;
  const caseText = [
    `Edad: ${c.age ?? "no registrada"}${c.sex ? ` · Sexo: ${c.sex}` : ""}`,
    c.allergies && `Alergias: ${c.allergies}`,
    c.medication && `Medicación habitual: ${c.medication}`,
    c.history && `Antecedentes: ${c.history}`,
    ...Object.entries(c.fields)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v}`),
    c.habits.length && `Conducta habitual de este médico en cuadros similares (preferila si es adecuada): ${c.habits.join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  const response = await requestAI(
    {
      model: env.aiModel,
      max_tokens: 1400,
      system:
        "Sos un asistente clínico para un médico de Argentina que está atendiendo. Te paso un caso sin datos identificatorios. " +
        "Devolvé sugerencias breves y accionables con la tool clinical_suggestions, en español rioplatense profesional. " +
        "Basate en guías vigentes (ADA, ESC/ESH, GOLD, GINA, KDIGO, NICE, SADI, SAP, Ministerio de Salud de la Nación) y nombrá la fuente. " +
        "Incluí: diagnósticos a considerar, estudios, opciones terapéuticas con dosis habituales de adultos como referencia a verificar, " +
        "controles a recordar en el seguimiento, signos de alarma y preguntas que faltan. Tené en cuenta alergias, medicación e interacciones. " +
        "No inventes datos del caso. Si falta información para sugerir, decilo en questions. El médico decide: son sugerencias, no indicaciones.",
      tools: [
        {
          name: "clinical_suggestions",
          description: "Sugerencias clínicas para el médico tratante.",
          input_schema: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Resumen del caso en una o dos oraciones." },
              considerations: { ...LIST, description: "Diagnósticos diferenciales o cuestiones a considerar." },
              workup: { ...LIST, description: "Estudios sugeridos." },
              treatmentOptions: {
                type: "array",
                items: {
                  type: "object",
                  properties: { option: { type: "string" }, rationale: { type: "string" }, source: { type: "string" } },
                  required: ["option"],
                },
              },
              followupChecks: { ...LIST, description: "Controles y recordatorios para el seguimiento." },
              redFlags: { ...LIST, description: "Signos de alarma a vigilar o descartar." },
              questions: { ...LIST, description: "Datos que faltan o preguntas para completar la evaluación." },
            },
            required: ["summary", "considerations", "workup", "treatmentOptions", "followupChecks", "redFlags", "questions"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "clinical_suggestions" },
      messages: [{ role: "user", content: caseText }],
    },
    { timeout: 20_000 },
  );
  const tool = response.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return null;
  const parsed = clinicalSuggestionsSchema.safeParse(tool.input);
  return parsed.success ? parsed.data : null;
}
