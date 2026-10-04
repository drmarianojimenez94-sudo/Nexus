/**
 * Perfiles de cumplimiento: lo que una profesión + jurisdicción exige.
 *
 * La rúbrica es la misma para todas las verticales; el perfil le dice qué
 * recursos estándar, campos legales, salvaguardas y capacidades son
 * obligatorios. Agregar una profesión nueva con exigencias propias es
 * agregar un perfil acá (o reutilizar `generic`), nunca tocar la rúbrica.
 */
export interface ComplianceProfile {
  id: string;
  name: string;
  /** Recursos del estándar que deben estar mapeados en `entities`. */
  requiredStandardResources: string[];
  minEntities: number;
  /** Referencias de `legal.recordFields` que deben estar cubiertas. */
  requiredLegalRefs: string[];
  requiredCoding: string[];
  minRetentionYears: number;
  maxSubjectCopySlaHours?: number;
  /** Acciones que la IA nunca puede ejecutar sola. */
  requiredForbiddenActions: string[];
  minRedFlags: number;
  requiresMedicationSafety: boolean;
  requiredWorkflows: string[];
  requiredTemplateStructure?: { structure: string; canonical: string[] };
  requiredCapabilities: string[];
  requiresInformedConsent: boolean;
  minGoldenCases: number;
  /** Dimensiones que, además del total, deben alcanzar el 70%. */
  gateDimensions: string[];
  passingScore: number;
}

export const PROFILES: Record<string, ComplianceProfile> = {
  "healthcare-ar": {
    id: "healthcare-ar",
    name: "Salud — Argentina (Leyes 26.529, 25.326, 27.553, 27.706)",
    requiredStandardResources: [
      "Patient",
      "Encounter",
      "Condition",
      "AllergyIntolerance",
      "MedicationStatement",
      "Observation",
      "Task",
      "Appointment",
      "DocumentReference",
      "Consent",
      "Provenance",
    ],
    minEntities: 8,
    requiredLegalRefs: [
      "ley26529.art15.a",
      "ley26529.art15.b",
      "ley26529.art15.c",
      "ley26529.art15.d",
      "ley26529.art15.e",
      "ley26529.art15.f",
    ],
    requiredCoding: ["CIE-10"],
    minRetentionYears: 10,
    maxSubjectCopySlaHours: 48,
    requiredForbiddenActions: [
      "autonomous_diagnosis",
      "dose_generation",
      "prescription_issuance",
      "consent_fabrication",
      "finalize_without_review",
    ],
    minRedFlags: 5,
    requiresMedicationSafety: true,
    requiredWorkflows: ["day-agenda", "encounter", "followups", "pending-review"],
    requiredTemplateStructure: { structure: "SOAP", canonical: ["S", "O", "A", "P"] },
    requiredCapabilities: ["microphone", "speechRecognition", "camera", "contacts", "calendar", "notifications", "biometrics"],
    requiresInformedConsent: true,
    minGoldenCases: 20,
    gateDimensions: ["legal-record", "integrity", "ai-review", "safety"],
    passingScore: 90,
  },
  generic: {
    id: "generic",
    name: "Genérico — profesiones sin perfil regulatorio propio",
    requiredStandardResources: [],
    minEntities: 3,
    requiredLegalRefs: [],
    requiredCoding: [],
    minRetentionYears: 5,
    requiredForbiddenActions: ["finalize_without_review", "external_send_without_confirmation"],
    minRedFlags: 0,
    requiresMedicationSafety: false,
    requiredWorkflows: ["day-agenda", "followups"],
    requiredCapabilities: ["microphone", "speechRecognition", "contacts", "calendar"],
    requiresInformedConsent: false,
    minGoldenCases: 5,
    gateDimensions: ["integrity", "ai-review"],
    passingScore: 80,
  },
};

export function profileFor(id: string): ComplianceProfile {
  const profile = PROFILES[id];
  if (!profile) throw new Error(`Perfil de cumplimiento desconocido: ${id}`);
  return profile;
}
