import type { VerticalManifest } from "./manifest";
import { fold, sentences, span, type Span } from "./text";

export interface RedFlagHit {
  id: string;
  label: string;
  severity: "critical" | "high";
  escalation: string;
  evidence: Span;
  /** El hallazgo aparece negado ("niega dolor torácico"): se informa, no se escala. */
  negated: boolean;
}
export interface NegationHit {
  cue: string;
  terms: string[];
  evidence: Span;
}
export interface MedicationMention {
  name: string;
  known: boolean;
  dose?: number;
  unit?: string;
  frequency?: string;
  evidence: Span;
  /** Siempre: las dosis se transcriben, nunca se generan, y el médico las verifica. */
  requiresVerification: true;
  issues: string[];
}
export interface AllergyConflict {
  medication: string;
  allergy: string;
  evidence: Span;
}
export interface SafetyReport {
  redFlags: RedFlagHit[];
  negations: NegationHit[];
  medications: MedicationMention[];
  allergies: string[];
  allergyConflicts: AllergyConflict[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** ¿La posición `at` cae bajo el alcance de una negación en su misma cláusula? */
export function isNegated(folded: string, at: number, cues: string[]): boolean {
  const clauseStart = Math.max(folded.lastIndexOf(".", at), folded.lastIndexOf(";", at), folded.lastIndexOf("\n", at), -1) + 1;
  const before = folded.slice(clauseStart, at);
  for (const cue of cues) {
    const re = new RegExp(`\\b${escape(cue)}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(before))) {
      const between = before.slice(m.index + m[0].length);
      // La negación alcanza enumeraciones ("niega fiebre, tos ni disnea"),
      // pero se corta ante un verbo afirmativo o un conector adversativo.
      if (between.length <= 60 && !/\b(pero|aunque|refiere|presenta|consulta|con|tiene|y\s+(?:refiere|presenta))\b/.test(between)) return true;
    }
  }
  return false;
}

export function detectNegations(source: string, manifest: VerticalManifest): NegationHit[] {
  const folded = fold(source);
  const hits: NegationHit[] = [];
  for (const c of sentences(source)) {
    const f = folded.slice(c.start, c.end);
    for (const cue of manifest.safety.negationCues) {
      const re = new RegExp(`\\b${escape(cue)}\\s+([^,.;]*(?:,\\s*[^,.;]*){0,4})`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(f))) {
        const scope = m[1]!.split(/\b(?:pero|aunque|refiere|presenta|consulta)\b/)[0]!;
        const cueRe = new RegExp(`^(?:${manifest.safety.negationCues.map(escape).join("|")})\\s+`);
        const terms = scope
          .split(/,|\bni\b|\by\b|\bo\b/)
          .map((t) => t.trim().replace(cueRe, "").replace(/^(?:de|la|el|los|las|signos de|sintomas de)\s+/, "").trim())
          .filter((t) => t.length > 2);
        if (!terms.length) continue;
        const start = c.start + m.index;
        hits.push({ cue, terms, evidence: span(source, start, start + cue.length + 1 + scope.trimEnd().length) });
      }
    }
  }
  return hits.sort((a, b) => a.evidence.start - b.evidence.start);
}

export function detectRedFlags(source: string, manifest: VerticalManifest): RedFlagHit[] {
  const folded = fold(source);
  const out: RedFlagHit[] = [];
  for (const flag of manifest.safety.redFlags) {
    for (const pattern of flag.patterns) {
      const m = new RegExp(pattern).exec(folded);
      if (!m) continue;
      out.push({
        id: flag.id,
        label: flag.label,
        severity: flag.severity,
        escalation: flag.escalation,
        evidence: span(source, m.index, m.index + m[0].length),
        // Se evalúa en el inicio y en la última palabra ("embarazo…, sin sangrado").
        negated: isNegated(folded, m.index, manifest.safety.negationCues) || isNegated(folded, m.index + Math.max(0, m[0].search(/\S+$/)), manifest.safety.negationCues),
      });
      break;
    }
  }
  return out;
}

const UNIT_RE = "(mg|mcg|ug|g|ml|ui|gotas|gota|comprimidos?|comp|puff|disparos?|%)";
const UNIT_NORMAL: Record<string, string> = { ug: "mcg", gota: "gotas", comprimido: "comprimidos", comp: "comprimidos", disparo: "puff", disparos: "puff" };
const toMg = (value: number, unit: string) => (unit === "g" ? value * 1000 : unit === "mcg" ? value / 1000 : value);

export function detectMedications(source: string, manifest: VerticalManifest): MedicationMention[] {
  const folded = fold(source);
  const found: MedicationMention[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  for (const med of manifest.safety.medicationCatalog) {
    for (const name of [med.name, ...med.aliases]) {
      const re = new RegExp(`\\b${escape(fold(name))}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(folded))) {
        if (overlaps(m.index, m.index + m[0].length)) continue;
        // Mencionado como alergia ("alérgico a amoxicilina"): no es indicación.
        if (/alergi[ac]o?s?\s+(?:a\s+(?:la\s+|los\s+)?)?$/.test(folded.slice(Math.max(0, m.index - 22), m.index))) continue;
        const tail = folded.slice(m.index + m[0].length, m.index + m[0].length + 40);
        const dose = new RegExp(`^\\s*(?:a\\s+)?(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RE}(\\s*/\\s*kg)?`).exec(tail);
        const freq = /cada\s+(\d+|una|dos|tres|cuatro|seis|ocho|doce)\s+(horas|hs|h|dias)|\b(\d)\s+veces\s+(?:al|por)\s+dia\b|\bcada\s+\d+\s*hs?\b/.exec(folded.slice(m.index, m.index + 80));
        const end = m.index + m[0].length + (dose ? dose.index + dose[0].length : 0);
        const mention: MedicationMention = {
          name: med.name,
          known: true,
          evidence: span(source, m.index, end),
          requiresVerification: true,
          issues: [],
        };
        if (freq) mention.frequency = source.slice(m.index + freq.index, m.index + freq.index + freq[0].length);
        if (dose) {
          mention.dose = Number(dose[1]!.replace(",", "."));
          const unit = UNIT_NORMAL[dose[2]!] ?? dose[2]!;
          mention.unit = unit;
          if (dose[3]) mention.frequency = `${mention.frequency ?? ""} (dosis por kg: verificar con el peso)`.trim();
          else if (!med.units.includes(unit)) mention.issues.push(`unidad «${unit}» inusual para ${med.name} (esperado: ${med.units.join(", ")})`);
          else if (med.maxSingleDose && ["mg", "g", "mcg"].includes(unit) && toMg(mention.dose, unit) > toMg(med.maxSingleDose, med.units[0]!))
            mention.issues.push(`dosis por toma mayor al máximo habitual de referencia (${med.maxSingleDose} ${med.units[0]})`);
        } else if (!/alergi/.test(folded.slice(Math.max(0, m.index - 20), m.index))) {
          mention.issues.push("dosis no especificada");
        }
        taken.push([m.index, end]);
        found.push(mention);
      }
    }
  }
  // Palabra desconocida seguida de dosis ("mirtazapina 15 mg"): se marca para verificar.
  const NOT_DRUGS = /^(?:glucemia|peso|talla|dosis|total|maximo|minimo|cada|hasta|desde|aproximadamente|presion|tension|frecuencia|saturacion|temperatura|hemoglobina|creatinina|colesterol|trigliceridos|potasio|sodio|calcio|plaquetas|leucocitos|insulinemia|ferritina|vitamina|ayunas|horas|semanas|meses|dias)$/;
  const bare = new RegExp(`\\b([a-z]{5,})\\s+(\\d+(?:[.,]\\d+)?)\\s*(mg|mcg|ug|g|ui)\\b`, "g");
  let b: RegExpExecArray | null;
  while ((b = bare.exec(folded))) {
    const end = b.index + b[0].length;
    if (overlaps(b.index, end) || NOT_DRUGS.test(b[1]!)) continue;
    taken.push([b.index, end]);
    found.push({
      name: b[1]!,
      known: false,
      dose: Number(b[2]!.replace(",", ".")),
      unit: UNIT_NORMAL[b[3]!] ?? b[3]!,
      evidence: span(source, b.index, end),
      requiresVerification: true,
      issues: ["fármaco fuera del catálogo de referencia: verificar nombre y dosis"],
    });
  }
  // Fármacos fuera del catálogo con dosis explícita ("indico zolpidem 10 mg").
  const unknown = new RegExp(`\\b(?:indico|indique|indicar|receto|recete|recetar|deje|toma|tomar|inicio|inicie|iniciar|rotar\\s+a|roto\\s+a|agrego|agregue|agregar|medicado\\s+con|subi|baje)\\s+([a-z]{4,})\\s+(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RE}`, "g");
  let m: RegExpExecArray | null;
  while ((m = unknown.exec(folded))) {
    const nameStart = m.index + m[0].indexOf(m[1]!);
    const end = m.index + m[0].length;
    if (overlaps(nameStart, end)) continue;
    found.push({
      name: m[1]!,
      known: false,
      dose: Number(m[2]!.replace(",", ".")),
      unit: UNIT_NORMAL[m[3]!] ?? m[3]!,
      evidence: span(source, nameStart, end),
      requiresVerification: true,
      issues: ["fármaco fuera del catálogo de referencia: verificar nombre y dosis"],
    });
  }
  return found.sort((a, b) => a.evidence.start - b.evidence.start);
}

export function detectAllergies(source: string): string[] {
  const folded = fold(source);
  const out = new Set<string>();
  const re = /\balergi(?:a|co|ca|cos|cas)\s+(?:a\s+(?:la\s+|los\s+|las\s+)?)?([a-z][a-z\s]{2,40}?)(?=[,.;]|\s+y\s|\s+e\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded))) {
    if (isNegated(folded, m.index, ["sin", "niega", "no refiere", "no conoce", "no tiene", "no presenta"])) continue;
    out.add(m[1]!.trim());
  }
  return [...out];
}

const stem = (w: string) => w.replace(/(es|s)$/, "").slice(0, 7);

export function allergyConflicts(meds: MedicationMention[], allergies: string[], manifest: VerticalManifest): AllergyConflict[] {
  if (!manifest.safety.allergyCrossCheck) return [];
  const out: AllergyConflict[] = [];
  const allergyStems = allergies.flatMap((a) => fold(a).split(/[\s,]+/).filter((w) => w.length > 3).map((w) => ({ allergy: a, stem: stem(w) })));
  for (const med of meds) {
    const catalog = manifest.safety.medicationCatalog.find((c) => c.name === med.name);
    const names = [med.name, ...(catalog?.aliases ?? []), ...(catalog?.classes ?? [])].map((n) => stem(fold(n)));
    const hit = allergyStems.find((a) => names.includes(a.stem));
    if (hit) out.push({ medication: med.name, allergy: hit.allergy, evidence: med.evidence });
  }
  return out;
}

export function analyzeSafety(source: string, manifest: VerticalManifest, knownAllergies: string[] = []): SafetyReport {
  const medications = detectMedications(source, manifest);
  const allergies = [...new Set([...knownAllergies.map((a) => a.trim()).filter(Boolean), ...detectAllergies(source)])];
  return {
    redFlags: detectRedFlags(source, manifest),
    negations: detectNegations(source, manifest),
    medications,
    allergies,
    allergyConflicts: allergyConflicts(medications, allergies, manifest),
  };
}

/**
 * ¿El texto contiene datos sensibles de la vertical (p. ej. un paciente con
 * datos clínicos)? Se usa para que el asistente general no envíe ese texto
 * a un proveedor de IA externo ni lo guarde sin cifrar en el inbox.
 */
export function looksSensitive(source: string, manifest: VerticalManifest): boolean {
  const folded = fold(source);
  const has = (patterns: string[]) => patterns.some((p) => new RegExp(p).test(folded));
  const subject = new RegExp(`\\b(?:${manifest.capture.subjectCues.join("|")})\\b`).test(folded);
  const document = new RegExp(manifest.capture.documentCue.pattern).test(folded);
  const domain =
    has(manifest.capture.sectionCues.flatMap((c) => c.patterns)) ||
    has(manifest.capture.measurements.map((m) => m.pattern)) ||
    has(manifest.safety.redFlags.flatMap((r) => r.patterns)) ||
    detectMedications(source, manifest).length > 0 ||
    has(manifest.capture.followupRules.flatMap((r) => r.patterns));
  return document || (subject && domain);
}
