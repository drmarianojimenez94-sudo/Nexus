import { fold } from "./text";

export interface Identifiers {
  /** Nombre y apellido de la persona (cada palabra se reemplaza). */
  names?: string[];
  documents?: string[];
  phones?: string[];
  /** Texto libre con datos de contacto de familiares, se elimina completo. */
  familyContact?: string;
}

export interface Deidentified {
  text: string;
  /** Qué se reemplazó, sin los valores: para mostrarle al profesional. */
  replaced: Array<"nombre" | "documento" | "teléfono" | "correo" | "fecha" | "dirección" | "otro nombre">;
}

// Palabras con mayúscula que no son nombres propios de personas.
const NOT_NAMES = new Set(
  [
    "paciente", "señor", "señora", "sr", "sra", "dr", "dra", "doctor", "doctora", "control", "guardia", "consulta", "motivo",
    "enfermedad", "actual", "tratamiento", "observaciones", "examen", "diagnostico", "plan", "indicaciones", "lunes", "martes",
    "miercoles", "jueves", "viernes", "sabado", "domingo", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre", "nota", "soap", "impresion", "antecedentes", "refiere",
    "niega", "presenta", "le", "la", "el", "lo", "se", "con", "sin", "en", "de", "del", "y", "a", "por", "para", "al",
    "hospital", "clinica", "sanatorio", "pami", "osde", "ioma", "swiss", "medical", "galeno", "omint", "argentina", "buenos", "aires",
  ].map(fold),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Quita lo que identifica a la persona antes de enviar texto clínico a un
 * proveedor de IA externo: nombre, documento, teléfonos, correos, fechas
 * completas, direcciones y otros nombres propios. Conserva edad, sexo y
 * los datos clínicos, que es lo que la IA necesita para sugerir.
 */
export function deidentify(source: string, ids: Identifiers = {}): Deidentified {
  let text = source;
  const replaced = new Set<Deidentified["replaced"][number]>();
  const sub = (re: RegExp, token: string, kind: Deidentified["replaced"][number]) => {
    const next = text.replace(re, token);
    if (next !== text) replaced.add(kind);
    text = next;
  };
  if (ids.familyContact?.trim()) sub(new RegExp(escape(ids.familyContact.trim()), "gi"), "[CONTACTO]", "otro nombre");
  for (const doc of ids.documents ?? []) {
    const digits = doc.replace(/\D/g, "");
    if (digits.length >= 6) sub(new RegExp(digits.split("").join("[.\\s-]?"), "g"), "[DOCUMENTO]", "documento");
  }
  for (const phone of ids.phones ?? []) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 6) sub(new RegExp(digits.split("").join("[\\s.()+-]*"), "g"), "[TELÉFONO]", "teléfono");
  }
  sub(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[CORREO]", "correo");
  for (const name of ids.names ?? [])
    for (const word of name.split(/\s+/).filter((w) => w.length >= 3))
      sub(new RegExp(`(?<![\\p{L}])${escape(word)}(?![\\p{L}])`, "giu"), "[PACIENTE]", "nombre");
  sub(/\b(?:dni|documento|cuit|cuil|d\.n\.i\.?)\s*(?:n(?:ro|°|º)?\.?\s*)?:?\s*\d{1,2}[.\s-]?\d{3}[.\s-]?\d{3}(?:[.\s-]?\d)?\b/gi, "[DOCUMENTO]", "documento");
  sub(/\b\d{1,2}\.\d{3}\.\d{3}\b/g, "[DOCUMENTO]", "documento");
  sub(/(?:\+?54\s?9?\s?)?\b(?:11|2\d{2,3}|3\d{2,3})[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[TELÉFONO]", "teléfono");
  sub(/\b(?:tel(?:efono)?|cel(?:ular)?|whatsapp)\.?\s*:?\s*\+?\d[\d\s-]{5,18}\d/gi, "[TELÉFONO]", "teléfono");
  sub(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "[FECHA]", "fecha");
  sub(/\b(?:calle|av\.?|avenida|pasaje|barrio|b°)\s+[\p{L}\s.]{2,40}?\s\d{1,5}\b/giu, "[DIRECCIÓN]", "dirección");
  // Otros nombres propios: palabras con mayúscula que no inician oración.
  text = text.replace(/([^.!?\n]\s)(\p{Lu}\p{Ll}{2,})(?:\s+(\p{Lu}\p{Ll}{2,}))*/gu, (match, lead: string, first: string) => {
    if (NOT_NAMES.has(fold(first))) return match;
    replaced.add("otro nombre");
    return `${lead}[NOMBRE]`;
  });
  text = text.replace(/(\[PACIENTE\](?:\s+\[PACIENTE\])+)/g, "[PACIENTE]");
  return { text, replaced: [...replaced] };
}

/** Edad en años a partir de una fecha ISO (sin exponer la fecha). */
export function ageFrom(birthDate: string | undefined, now = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}
