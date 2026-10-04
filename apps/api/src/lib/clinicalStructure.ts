import { z } from "zod";
import { deidentify, type Identifiers } from "@nexus/verticals";
import { env } from "./env.js";
import { requestAI } from "./aiTransport.js";

export interface Section {
  key: string;
  label: string;
}
export type StructuredFields = Record<string, { value: string; quotes: string[] }>;

const fieldSchema = z.object({
  value: z.string().max(6000).default(""),
  quotes: z.array(z.string().max(400)).max(12).default([]),
});

// Lo que la IA no debe devolver aunque el dictado lo traiga enmascarado.
const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/\[PACIENTE\]/g, "paciente"],
  [/\s*\[(?:DOCUMENTO|TELÉFONO|CORREO|CONTACTO|DIRECCIÓN|FECHA|NOMBRE)\]/g, ""],
];
const clean = (s: string) => PLACEHOLDERS.reduce((acc, [re, to]) => acc.replace(re, to), s).replace(/\s{2,}/g, " ").trim();

/**
 * La IA lee el relato completo de la consulta (ya sin nombre, DNI, teléfono
 * ni direcciones) y lo reparte en las secciones de la plantilla, entendiendo
 * el contexto: un hallazgo al examinar va a examen físico aunque no se diga
 * «examen físico». Devuelve, por sección, el texto redactado y las citas
 * literales del dictado que lo respaldan. Nunca agrega datos que no se dijeron.
 */
export async function structureDictation(
  text: string,
  sections: Section[],
  ids: Identifiers,
): Promise<StructuredFields | null> {
  if (!sections.length || text.trim().length < 8) return null;
  const story = deidentify(text, ids).text;
  const properties = Object.fromEntries(
    sections.map((s) => [
      s.key,
      {
        type: "object",
        description: s.label,
        properties: {
          value: { type: "string", description: `Contenido de «${s.label}». Vacío si no se mencionó.` },
          quotes: { type: "array", items: { type: "string" }, description: "Fragmentos copiados literalmente del dictado que respaldan este campo." },
        },
        required: ["value", "quotes"],
      },
    ]),
  );
  const response = await requestAI(
    {
      model: env.aiModel,
      max_tokens: 2500,
      system:
        "Sos el asistente de un médico de Argentina. Te paso el dictado de una consulta, tal como lo habló, sin datos identificatorios. " +
        "Entendé el contexto clínico y repartí TODO el contenido en las secciones de la tool structure_consultation, como lo escribiría el médico en la historia clínica: " +
        "motivo de consulta breve; enfermedad actual con tiempo de evolución y síntomas (incluidos los negativos); antecedentes personales, hábitos, alergias y medicación habitual en antecedentes; " +
        "signos vitales y hallazgos al examinar en examen físico aunque no se diga «examen físico»; estudios y resultados donde correspondan; " +
        "el diagnóstico o impresión diagnóstica solo si el médico lo dijo; tratamiento con fármaco, dosis, frecuencia y duración tal cual se indicó; " +
        "indicaciones, pautas de alarma, controles y lo demás en observaciones o en la sección que corresponda. " +
        "Reglas: no inventes ni completes datos que no se dijeron; no agregues diagnósticos ni tratamientos propios; corregí muletillas, repeticiones y errores obvios de dictado; " +
        "usá lenguaje médico claro en español rioplatense; no nombres al paciente; dejá vacía una sección si no se mencionó. " +
        "En quotes copiá textualmente (sin cambiar palabras) los fragmentos del dictado de los que sale cada sección.",
      tools: [
        {
          name: "structure_consultation",
          description: "Secciones de la consulta ordenadas a partir del dictado.",
          input_schema: { type: "object", properties, required: sections.map((s) => s.key) },
        },
      ],
      tool_choice: { type: "tool", name: "structure_consultation" },
      messages: [{ role: "user", content: story }],
    },
    { timeout: 25_000 },
  );
  const tool = response.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use" || !tool.input || typeof tool.input !== "object") return null;
  const out: StructuredFields = {};
  for (const s of sections) {
    const parsed = fieldSchema.safeParse((tool.input as Record<string, unknown>)[s.key]);
    if (!parsed.success) continue;
    const value = clean(parsed.data.value);
    if (value) out[s.key] = { value, quotes: parsed.data.quotes.map(clean).filter(Boolean) };
  }
  return Object.keys(out).length ? out : null;
}
