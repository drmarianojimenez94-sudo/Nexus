import { z } from "zod";

/**
 * Contrato genérico de una vertical profesional.
 *
 * El núcleo de NEXUS nunca sabe qué es "medicina" o "abogacía": interpreta
 * este manifiesto. Una vertical nueva es un archivo de datos que valida
 * contra este esquema, más un perfil de cumplimiento (profiles.ts) que fija
 * lo que la jurisdicción/profesión exige. La rúbrica (rubric.ts) puntúa el
 * manifiesto contra ese perfil.
 */

const id = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, "id en kebab-case");
const key = z.string().regex(/^[a-z][a-zA-Z0-9_]{0,39}$/);
const label = z.string().trim().min(1).max(160);
const sentence = z.string().trim().min(1).max(600);

export const vocabularySchema = z.object({
  /** Persona atendida: paciente, cliente, consultante… */
  subject: z.object({ singular: label, plural: label }),
  /** Registro profesional: consulta, sesión, expediente… */
  record: z.object({ singular: label, plural: label }),
  /** Pendiente ligado a la persona: seguimiento, vencimiento… */
  followup: z.object({ singular: label, plural: label }),
  appointment: z.object({ singular: label, plural: label }),
  professional: label,
  /** Términos del dominio que el reconocimiento de voz debe privilegiar. */
  domainTerms: z.array(z.string().min(2)).default([]),
});

export const fieldSchema = z.object({
  key,
  label,
  required: z.boolean().default(false),
  /** Referencia legal que este campo satisface (ver legal.recordFields). */
  legalRef: z.string().optional(),
  /** Sistema de codificación del valor (CIE-10, LOINC, ATC…). */
  coding: z.string().optional(),
});

export const entitySchema = z.object({
  id: key,
  label,
  /** Recurso del estándar de interoperabilidad (FHIR para salud). */
  standardResource: z.string().min(2),
  sensitive: z.boolean(),
  identifier: key.optional(),
  fields: z.array(fieldSchema).min(1),
  /** Dónde vive hoy en NEXUS: tabla/endpoint o "planned". */
  storage: z.string().min(2),
});

export const relationshipSchema = z.object({
  from: key,
  to: key,
  kind: z.enum(["belongsTo", "hasMany", "references"]),
});

export const templateSectionSchema = z.object({
  key,
  label,
  /** Sección canónica (S/O/A/P para SOAP, o la que defina la profesión). */
  canonical: z.string().optional(),
  aiGenerated: z.boolean().default(false),
});

export const templateSchema = z.object({
  id: z.string().min(1).max(100),
  name: label,
  structure: z.string().min(2),
  sections: z.array(templateSectionSchema).min(1),
});

export const workflowSchema = z.object({
  id,
  name: label,
  states: z.array(key).min(2),
  initial: key,
  final: z.array(key).min(1),
  transitions: z
    .array(
      z.object({
        from: key,
        to: key,
        trigger: sentence,
        requiresHuman: z.boolean(),
      }),
    )
    .min(1),
  /** Pendientes con vencimiento que el flujo puede generar. */
  createsFollowups: z.boolean().default(false),
});

export const legalSchema = z.object({
  jurisdiction: z.string().min(2).max(10),
  frameworks: z
    .array(z.object({ id: z.string().min(2), name: label, url: z.string().url() }))
    .min(1),
  recordFields: z
    .array(
      z.object({
        ref: z.string().min(2),
        description: sentence,
        /** `entidad.campo` que cubre el requisito. */
        coveredBy: z.array(z.string().regex(/^[a-zA-Z]+\.[a-zA-Z0-9_]+$/)).min(1),
      }),
    )
    .min(1),
  retention: z.object({
    years: z.number().int().min(0),
    from: z.enum(["last_activity", "creation"]),
  }),
  appendOnlyAfterSignature: z.boolean(),
  amendmentsAsNewEntries: z.boolean(),
  audit: z.object({ reads: z.boolean(), writes: z.boolean(), actor: z.boolean() }),
  subjectCopySlaHours: z.number().int().positive().optional(),
  coding: z.array(z.string()).default([]),
  authorship: z.object({
    author: z.boolean(),
    specialty: z.boolean(),
    timestamp: z.boolean(),
    signedAt: z.boolean(),
  }),
  chronological: z.boolean(),
  sequenced: z.boolean(),
  /** Actos que la vertical NO puede emitir por regulación (p. ej. receta). */
  regulatedOutputs: z
    .array(z.object({ id: key, description: sentence, handledBy: sentence }))
    .default([]),
});

export const consentSchema = z.object({
  recording: z.object({
    required: z.boolean(),
    recordedBy: z.enum(["human", "ai"]),
    beforeCapture: z.boolean(),
    statement: sentence,
  }),
  informedConsent: z
    .object({ templateId: z.string().min(1), fields: z.array(key).min(1) })
    .optional(),
  revocable: z.boolean(),
});

export const aiPolicySchema = z.object({
  /** ¿Se pueden enviar datos sensibles a un proveedor de IA externo? */
  sensitiveToExternalAI: z.boolean(),
  /** Qué hace el asistente general si detecta datos sensibles. */
  sensitiveRouting: z.enum(["block", "redirect_to_vertical", "deidentify"]),
  humanReviewRequired: z.boolean(),
  generatedFields: z
    .array(
      z.object({
        field: z.string().min(2),
        source: z.enum(["ai", "rules", "human"]),
        requiresHumanReview: z.boolean(),
        initialStatus: z.enum(["draft", "proposed", "final"]),
      }),
    )
    .min(1),
  provisionalCategories: z.array(key).default([]),
  provenance: z.boolean(),
  evidenceLinking: z.boolean(),
  forbiddenActions: z.array(z.object({ id: key, description: sentence })).min(1),
});

export const redFlagSchema = z.object({
  id: key,
  label,
  /** Expresiones regulares sobre texto normalizado (minúsculas, sin tildes). */
  patterns: z.array(z.string().min(2)).min(1),
  severity: z.enum(["critical", "high"]),
  escalation: sentence,
});

export const medicationSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9 ]{1,59}$/, "nombre genérico en minúsculas, sin tildes"),
  aliases: z.array(z.string()).default([]),
  classes: z.array(z.string().min(2)).default([]),
  units: z.array(z.string()).min(1),
  /** Dosis máxima por toma en la unidad principal (units[0]) para adultos. */
  maxSingleDose: z.number().positive().optional(),
});

export const safetySchema = z.object({
  redFlags: z.array(redFlagSchema),
  negationCues: z.array(z.string()).min(1),
  medicationCatalog: z.array(medicationSchema),
  allergyCrossCheck: z.boolean(),
  doseVerification: z.boolean(),
});

export const capabilitySchema = z.object({
  id: z.enum([
    "microphone",
    "speechRecognition",
    "camera",
    "photos",
    "contacts",
    "calendar",
    "notifications",
    "biometrics",
    "location",
  ]),
  purpose: sentence,
  ios: z.object({ infoPlistKeys: z.array(z.string().regex(/^NS[A-Za-z]+$/)) }),
  android: z.object({ permissions: z.array(z.string()) }),
  expoPlugin: z
    .object({ name: z.string().min(2), option: z.string().min(2).optional() })
    .optional(),
  rationale: z.string().trim().min(20).max(400),
  fallback: sentence,
  prefersSystemPicker: z.boolean().default(false),
  background: z.boolean().default(false),
  status: z.enum(["implemented", "planned"]),
});

export const privacySchema = z.object({
  sensitiveData: z.boolean(),
  encryptionAtRest: z.string().min(2),
  encryptionInTransit: z.string().min(2),
  audioRetention: z.enum(["not_stored", "discard_after_transcription", "retained_with_consent"]),
  appointmentTitles: z.enum(["initials", "generic", "full_name"]),
  noAdvertising: z.boolean(),
  noTrainingWithoutConsent: z.boolean(),
  noCloudBackupOfSensitiveData: z.boolean(),
  accountDeletion: z.boolean(),
  dataSubjectRights: z.array(z.enum(["access", "rectification", "suppression", "portability"])),
  localDeviceProtection: sentence,
});

export const storeSchema = z.object({
  category: z.string().min(2),
  disclaimer: sentence,
  privacyPolicyPath: z.string().min(1),
  appleHealthDataRules: z.boolean(),
  playHealthDeclaration: z.boolean(),
  dataSafetyDeclared: z.boolean(),
});

export const goldenCaseSchema = z.object({
  id: z.string().min(1),
  utterance: z.string().min(3),
  expect: z.object({
    subjectName: z.string().optional(),
    document: z.string().optional(),
    templateId: z.string().optional(),
    fields: z.record(z.string()).optional(),
    followups: z.array(z.object({ kind: z.string(), inDays: z.number().int() })).optional(),
    appointmentAt: z.string().optional(),
    redFlags: z.array(z.string()).optional(),
    negated: z.array(z.string()).optional(),
    medications: z.array(z.object({ name: z.string(), flagged: z.boolean() })).optional(),
    allergyConflicts: z.array(z.string()).optional(),
    mustNotContain: z.array(z.string()).optional(),
  }),
});

export const evaluationSchema = z.object({
  /** Fecha de referencia fija para que las fechas relativas sean reproducibles. */
  referenceNow: z.string().datetime(),
  goldenCases: z.array(goldenCaseSchema),
  errorTaxonomy: z.array(
    z.object({ id: key, label, severity: z.enum(["major", "minor"]) }),
  ),
  releaseThreshold: z.object({ maxMajorErrors: z.number().int().min(0), minPassRate: z.number().min(0).max(1) }),
});

export const intentSchema = z.object({
  id: key,
  /** Paso del plan que produce. */
  step: z.enum(["subject", "record", "followup", "appointment", "task"]),
  patterns: z.array(z.string().min(2)).min(1),
  permissionLevel: z.number().int().min(0).max(4),
  example: sentence,
});

export const captureSchema = z.object({
  /** Marcadores que introducen a la persona ("paciente", "cliente"). */
  subjectCues: z.array(z.string()).min(1),
  newSubjectCues: z.array(z.string()).min(1),
  /** Identificador documental y su patrón (DNI, CUIT…). */
  documentCue: z.object({ label, pattern: z.string().min(2) }),
  /** Plantilla por defecto y reglas de selección por palabra clave. */
  defaultTemplate: z.string(),
  newSubjectTemplate: z.string(),
  templateRules: z.array(z.object({ templateId: z.string(), patterns: z.array(z.string()).min(1) })),
  /**
   * Extracción de secciones: el texto que sigue a la señal va al primer
   * campo de `targets` que exista en la plantilla elegida.
   */
  sectionCues: z.array(
    z.object({ id: key, targets: z.array(key).min(1), patterns: z.array(z.string()).min(1), provisional: z.boolean().default(false) }),
  ),
  /** Mediciones con unidades (signos vitales, montos, superficies…). */
  measurements: z.array(z.object({ id: key, label, pattern: z.string().min(2), unit: z.string(), targets: z.array(key).min(1) })),
  /** Campo de la plantilla que resume los pendientes dictados. */
  followupTargets: z.array(key).default([]),
  /** Dónde van las cláusulas sin señal explícita (relato libre). */
  fallbackTargets: z.array(key).min(1),
  /** Palabras que cortan un nombre propio dictado ("de", "con", "consulta"…). */
  nameStopWords: z.array(z.string()).min(1),
  followupRules: z.array(
    z.object({ kind: z.string().min(2), patterns: z.array(z.string()).min(1), title: label }),
  ),
  appointmentCues: z.array(z.string()).min(1),
});

/** Rutas de la app (web y nativa) para cada pantalla de la vertical. */
export const routesSchema = z.object({
  home: z.string().startsWith("/"),
  subjects: z.string().startsWith("/"),
  subject: z.string().includes(":id"),
  followups: z.string().startsWith("/"),
  capture: z.string().startsWith("/"),
  calendar: z.string().startsWith("/"),
});

export const suggestionRuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/),
  description: sentence,
});

export const verticalManifestSchema = z.object({
  id,
  name: label,
  profession: label,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  profile: id,
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
  timezone: z.string().min(3),
  status: z.enum(["draft", "beta", "approved"]),
  vocabulary: vocabularySchema,
  standard: z.object({ name: label, url: z.string().url() }),
  entities: z.array(entitySchema).min(1),
  relationships: z.array(relationshipSchema),
  templates: z.array(templateSchema).min(1),
  workflows: z.array(workflowSchema).min(1),
  legal: legalSchema,
  consent: consentSchema,
  ai: aiPolicySchema,
  safety: safetySchema,
  capabilities: z.array(capabilitySchema),
  privacy: privacySchema,
  store: storeSchema,
  evaluation: evaluationSchema,
  intents: z.array(intentSchema).min(1),
  capture: captureSchema,
  suggestions: z.array(suggestionRuleSchema).min(1),
  routes: routesSchema,
});

export type VerticalManifest = z.infer<typeof verticalManifestSchema>;
export type VerticalManifestInput = z.input<typeof verticalManifestSchema>;
export type Capability = VerticalManifest["capabilities"][number];
export type GoldenCase = z.infer<typeof goldenCaseSchema>;

/** Valida y además comprueba coherencia referencial que Zod no puede ver. */
export function defineVertical(input: VerticalManifestInput): VerticalManifest {
  const manifest = verticalManifestSchema.parse(input);
  const problems = consistencyProblems(manifest);
  if (problems.length)
    throw new Error(`Vertical ${manifest.id} inconsistente:\n- ${problems.join("\n- ")}`);
  return manifest;
}

export function consistencyProblems(m: VerticalManifest): string[] {
  const out: string[] = [];
  const entities = new Map(m.entities.map((e) => [e.id, e]));
  const templates = new Set(m.templates.map((t) => t.id));
  for (const r of m.relationships) {
    if (!entities.has(r.from)) out.push(`relación desde entidad inexistente ${r.from}`);
    if (!entities.has(r.to)) out.push(`relación hacia entidad inexistente ${r.to}`);
  }
  for (const e of m.entities) {
    if (e.identifier && !e.fields.some((f) => f.key === e.identifier))
      out.push(`${e.id}.identifier apunta a un campo inexistente`);
  }
  for (const f of m.legal.recordFields)
    for (const ref of f.coveredBy) {
      const [entity, field] = ref.split(".");
      if (!entities.get(entity!)?.fields.some((x) => x.key === field))
        out.push(`requisito legal ${f.ref} cubierto por ${ref}, que no existe`);
    }
  for (const w of m.workflows) {
    const states = new Set(w.states);
    if (!states.has(w.initial)) out.push(`flujo ${w.id}: estado inicial desconocido`);
    for (const s of w.final) if (!states.has(s)) out.push(`flujo ${w.id}: estado final ${s} desconocido`);
    for (const t of w.transitions)
      if (!states.has(t.from) || !states.has(t.to))
        out.push(`flujo ${w.id}: transición ${t.from}→${t.to} inválida`);
  }
  for (const t of [m.capture.defaultTemplate, m.capture.newSubjectTemplate, ...m.capture.templateRules.map((r) => r.templateId)])
    if (!templates.has(t)) out.push(`plantilla de captura ${t} no declarada`);
  if (m.consent.informedConsent && !templates.has(m.consent.informedConsent.templateId))
    out.push("plantilla de consentimiento informado no declarada");
  const patterns = [
    ...m.safety.redFlags.flatMap((r) => r.patterns),
    ...m.intents.flatMap((i) => i.patterns),
    ...m.capture.sectionCues.flatMap((s) => s.patterns),
    ...m.capture.measurements.map((x) => x.pattern),
    ...m.capture.followupRules.flatMap((x) => x.patterns),
    ...m.capture.templateRules.flatMap((x) => x.patterns),
    m.capture.documentCue.pattern,
  ];
  for (const p of patterns) {
    try {
      new RegExp(p);
    } catch {
      out.push(`expresión regular inválida: ${p}`);
    }
  }
  return out;
}
