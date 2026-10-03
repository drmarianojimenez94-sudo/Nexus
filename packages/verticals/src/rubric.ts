import { consistencyProblems, type VerticalManifest } from "./manifest";
import { profileFor, type ComplianceProfile } from "./profiles";
import type { EvaluationReport } from "./evaluation";

export interface RubricCheck {
  id: string;
  description: string;
  points: number;
  earned: number;
  detail?: string;
}
export interface RubricDimension {
  id: string;
  name: string;
  weight: number;
  earned: number;
  checks: RubricCheck[];
}
export interface Scorecard {
  verticalId: string;
  profile: string;
  score: number;
  passingScore: number;
  passed: boolean;
  gateFailures: string[];
  dimensions: RubricDimension[];
}

type Check = (m: VerticalManifest, p: ComplianceProfile, e?: EvaluationReport) => { ratio: number; detail?: string };
interface CheckDef {
  id: string;
  description: string;
  points: number;
  run: Check;
}
interface DimensionDef {
  id: string;
  name: string;
  checks: CheckDef[];
}

const ratio = (ok: number, total: number) => (total === 0 ? 1 : Math.max(0, Math.min(1, ok / total)));
const all = (cond: boolean, detail?: string) => ({ ratio: cond ? 1 : 0, detail: cond ? undefined : detail });
const missing = (needed: string[], have: Iterable<string>) => {
  const set = new Set(have);
  return needed.filter((x) => !set.has(x));
};
const coverage = (needed: string[], have: Iterable<string>, what: string) => {
  const lack = missing(needed, have);
  return { ratio: ratio(needed.length - lack.length, needed.length), detail: lack.length ? `${what} faltantes: ${lack.join(", ")}` : undefined };
};

const DIMENSIONS: DimensionDef[] = [
  {
    id: "ontology",
    name: "Ontología y estándar de interoperabilidad",
    checks: [
      {
        id: "entity-count",
        description: "Cantidad mínima de entidades, cada una mapeada a un recurso estándar",
        points: 4,
        run: (m, p) => all(m.entities.length >= p.minEntities && m.entities.every((e) => e.standardResource), `${m.entities.length}/${p.minEntities} entidades`),
      },
      {
        id: "standard-resources",
        description: "Recursos estándar exigidos por el perfil presentes",
        points: 4,
        run: (m, p) => coverage(p.requiredStandardResources, m.entities.map((e) => e.standardResource), "Recursos"),
      },
      {
        id: "required-fields",
        description: "Cada entidad declara campos obligatorios y la persona tiene identificador único",
        points: 2,
        run: (m) => {
          const subject = m.entities[0];
          const ok = m.entities.filter((e) => e.fields.some((f) => f.required)).length;
          return { ratio: ratio(ok, m.entities.length) * (subject?.identifier ? 1 : 0.5) };
        },
      },
      {
        id: "relationships",
        description: "Relaciones coherentes entre entidades existentes",
        points: 2,
        run: (m) => all(m.relationships.length >= m.entities.length - 1 && consistencyProblems(m).length === 0, "relaciones insuficientes o inconsistentes"),
      },
    ],
  },
  {
    id: "legal-record",
    name: "Registro profesional exigido por ley",
    checks: [
      {
        id: "legal-fields",
        description: "Asientos obligatorios de la jurisdicción cubiertos por campos concretos",
        points: 6,
        run: (m, p) => coverage(p.requiredLegalRefs, m.legal.recordFields.map((f) => f.ref), "Asientos"),
      },
      {
        id: "coding",
        description: "Sistemas de codificación exigidos declarados y usados en algún campo",
        points: 2,
        run: (m, p) => {
          const used = new Set(m.entities.flatMap((e) => e.fields.map((f) => f.coding).filter(Boolean) as string[]));
          const ok = p.requiredCoding.filter((c) => m.legal.coding.includes(c) && used.has(c));
          return { ratio: ratio(ok.length, p.requiredCoding.length), detail: ok.length < p.requiredCoding.length ? "codificación sin uso" : undefined };
        },
      },
      {
        id: "authorship",
        description: "Autor, especialidad, fecha y firma en cada asiento",
        points: 2,
        run: (m) => {
          const a = m.legal.authorship;
          return { ratio: ratio([a.author, a.specialty, a.timestamp, a.signedAt].filter(Boolean).length, 4) };
        },
      },
      {
        id: "chronology",
        description: "Orden cronológico y secuencia/foliado",
        points: 2,
        run: (m) => ({ ratio: ratio([m.legal.chronological, m.legal.sequenced].filter(Boolean).length, 2) }),
      },
    ],
  },
  {
    id: "integrity",
    name: "Retención, integridad y auditoría",
    checks: [
      {
        id: "retention",
        description: "Retención mínima desde la última actuación",
        points: 3,
        run: (m, p) => all(m.legal.retention.years >= p.minRetentionYears && m.legal.retention.from === "last_activity", `retención ${m.legal.retention.years} años`),
      },
      {
        id: "append-only",
        description: "Registro inalterable tras la firma; correcciones como nuevas entradas",
        points: 3,
        run: (m) => ({ ratio: ratio([m.legal.appendOnlyAfterSignature, m.legal.amendmentsAsNewEntries].filter(Boolean).length, 2) }),
      },
      {
        id: "audit",
        description: "Auditoría de lecturas y escrituras con actor",
        points: 2,
        run: (m) => ({ ratio: ratio(Object.values(m.legal.audit).filter(Boolean).length, 3) }),
      },
      {
        id: "subject-copy",
        description: "Copia/exportación para la persona dentro del plazo legal",
        points: 2,
        run: (m, p) =>
          all(
            m.legal.subjectCopySlaHours !== undefined && (p.maxSubjectCopySlaHours === undefined || m.legal.subjectCopySlaHours <= p.maxSubjectCopySlaHours),
            "sin plazo de copia declarado",
          ),
      },
    ],
  },
  {
    id: "consent",
    name: "Consentimiento",
    checks: [
      {
        id: "recording-consent",
        description: "La captura de audio exige consentimiento registrado por un humano antes de empezar",
        points: 3,
        run: (m) => {
          const r = m.consent.recording;
          return all(r.required && r.recordedBy === "human" && r.beforeCapture, "el consentimiento de grabación no es humano/previo");
        },
      },
      {
        id: "informed-consent",
        description: "Plantilla de consentimiento informado con los elementos exigidos",
        points: 3,
        run: (m, p) => {
          if (!p.requiresInformedConsent) return { ratio: 1 };
          const ic = m.consent.informedConsent;
          if (!ic) return { ratio: 0, detail: "sin plantilla de consentimiento" };
          const tpl = m.templates.find((t) => t.id === ic.templateId);
          const keys = new Set(tpl?.sections.map((s) => s.key));
          return coverage(ic.fields, keys, "Elementos de consentimiento");
        },
      },
      {
        id: "revocation",
        description: "Revocación del consentimiento contemplada",
        points: 2,
        run: (m) => all(m.consent.revocable, "no revocable"),
      },
    ],
  },
  {
    id: "ai-review",
    name: "Política de IA y revisión humana",
    checks: [
      {
        id: "human-review",
        description: "Todo campo generado por IA o reglas queda en borrador y exige revisión humana",
        points: 5,
        run: (m) => {
          const gen = m.ai.generatedFields.filter((f) => f.source !== "human");
          const ok = gen.filter((f) => f.requiresHumanReview && f.initialStatus !== "final");
          return { ratio: m.ai.humanReviewRequired ? ratio(ok.length, gen.length) : 0 };
        },
      },
      {
        id: "provisional",
        description: "Categorías diagnósticas/juicios forzados a provisional",
        points: 2,
        run: (m) => all(m.ai.provisionalCategories.length > 0, "sin categorías provisionales"),
      },
      {
        id: "provenance",
        description: "Procedencia IA/reglas/humano persistida",
        points: 2,
        run: (m) => all(m.ai.provenance && m.entities.some((e) => e.standardResource === "Provenance" || e.id === "provenance"), "sin entidad de procedencia"),
      },
      {
        id: "evidence",
        description: "Evidencia vinculada (fragmento de transcripción) para cada dato propuesto",
        points: 3,
        run: (m, _p, e) => {
          if (!m.ai.evidenceLinking) return { ratio: 0, detail: "sin evidencia vinculada" };
          if (!e) return { ratio: 0.5, detail: "evidencia declarada pero no medida" };
          return { ratio: e.evidenceCoverage, detail: e.evidenceCoverage < 1 ? `cobertura de evidencia ${(e.evidenceCoverage * 100).toFixed(0)}%` : undefined };
        },
      },
    ],
  },
  {
    id: "safety",
    name: "Salvaguardas del dominio",
    checks: [
      {
        id: "forbidden",
        description: "Acciones prohibidas para la IA declaradas",
        points: 3,
        run: (m, p) => coverage(p.requiredForbiddenActions, m.ai.forbiddenActions.map((f) => f.id), "Prohibiciones"),
      },
      {
        id: "red-flags",
        description: "Señales de alarma con escalamiento",
        points: 3,
        run: (m, p) => {
          if (p.minRedFlags === 0) return { ratio: 1 };
          const ok = m.safety.redFlags.filter((r) => r.escalation && r.patterns.length);
          return { ratio: ratio(Math.min(ok.length, p.minRedFlags), p.minRedFlags), detail: ok.length < p.minRedFlags ? `${ok.length}/${p.minRedFlags} señales` : undefined };
        },
      },
      {
        id: "medication",
        description: "Validación de fármacos, dosis y unidades contra catálogo",
        points: 2,
        run: (m, p) => (p.requiresMedicationSafety ? all(m.safety.doseVerification && m.safety.medicationCatalog.length >= 10, "catálogo insuficiente") : { ratio: 1 }),
      },
      {
        id: "negation-allergy",
        description: "Detección de negaciones y cruce de alergias",
        points: 2,
        run: (m, p) => ({ ratio: ratio([m.safety.negationCues.length >= 5, !p.requiresMedicationSafety || m.safety.allergyCrossCheck].filter(Boolean).length, 2) }),
      },
    ],
  },
  {
    id: "workflows",
    name: "Flujos de trabajo",
    checks: [
      {
        id: "required-workflows",
        description: "Flujos exigidos con estados y transiciones válidas",
        points: 4,
        run: (m, p) => coverage(p.requiredWorkflows, m.workflows.map((w) => w.id), "Flujos"),
      },
      {
        id: "followups",
        description: "Algún flujo genera pendientes con vencimiento",
        points: 2,
        run: (m) => all(m.workflows.some((w) => w.createsFollowups) && m.capture.followupRules.length > 0, "sin generación de pendientes"),
      },
      {
        id: "template-structure",
        description: "Plantilla con la estructura canónica del dominio",
        points: 2,
        run: (m, p) => {
          const req = p.requiredTemplateStructure;
          if (!req) return { ratio: m.templates.length ? 1 : 0 };
          const tpl = m.templates.find((t) => t.structure === req.structure);
          return coverage(req.canonical, tpl?.sections.map((s) => s.canonical ?? "") ?? [], "Secciones");
        },
      },
    ],
  },
  {
    id: "native",
    name: "Capacidades y permisos nativos",
    checks: [
      {
        id: "permission-declarations",
        description: "Cada capacidad exigida declara permisos iOS/Android, plugin y justificación",
        points: 4,
        run: (m, p) => {
          const ok = p.requiredCapabilities.filter((id) => {
            const c = m.capabilities.find((x) => x.id === id);
            return c && c.rationale.length >= 40 && (c.ios.infoPlistKeys.length > 0 || c.id === "notifications") && (c.android.permissions.length > 0 || c.id === "biometrics" || c.id === "speechRecognition") && c.expoPlugin;
          });
          return { ratio: ratio(ok.length, p.requiredCapabilities.length), detail: ok.length < p.requiredCapabilities.length ? `faltan: ${missing(p.requiredCapabilities, ok).join(", ")}` : undefined };
        },
      },
      {
        id: "fallbacks",
        description: "Alternativa funcional si se niega cada permiso",
        points: 2,
        run: (m) => ({ ratio: ratio(m.capabilities.filter((c) => c.fallback.length > 10).length, m.capabilities.length) }),
      },
      {
        id: "minimization",
        description: "Selectores del sistema donde existen y sin segundo plano no justificado",
        points: 2,
        run: (m) => {
          const pickers = m.capabilities.filter((c) => ["contacts", "photos"].includes(c.id));
          const pickerOk = pickers.every((c) => c.prefersSystemPicker);
          const bgOk = m.capabilities.every((c) => !c.background || c.status === "implemented");
          return { ratio: ratio([pickerOk, bgOk].filter(Boolean).length, 2) };
        },
      },
    ],
  },
  {
    id: "privacy",
    name: "Privacidad y datos sensibles",
    checks: [
      {
        id: "sensitive-encryption",
        description: "Datos sensibles marcados y cifrados en reposo y tránsito",
        points: 3,
        run: (m) => all(m.privacy.sensitiveData && m.entities.filter((e) => e.sensitive).length > 0 && !!m.privacy.encryptionAtRest && !!m.privacy.encryptionInTransit),
      },
      {
        id: "audio-retention",
        description: "Retención del audio explícita y mínima; agenda sin nombres completos",
        points: 2,
        run: (m) => ({ ratio: ratio([m.privacy.audioRetention !== "retained_with_consent", m.privacy.appointmentTitles !== "full_name"].filter(Boolean).length, 2) }),
      },
      {
        id: "secondary-use",
        description: "Sin publicidad, entrenamiento sin consentimiento ni copia en nube personal; IA externa bloqueada para datos sensibles",
        points: 2,
        run: (m) => ({
          ratio: ratio([m.privacy.noAdvertising, m.privacy.noTrainingWithoutConsent, m.privacy.noCloudBackupOfSensitiveData, !m.ai.sensitiveToExternalAI || m.ai.sensitiveRouting === "deidentify"].filter(Boolean).length, 4),
        }),
      },
      {
        id: "rights",
        description: "Borrado de cuenta y derechos de acceso, rectificación y supresión",
        points: 1,
        run: (m) => all(m.privacy.accountDeletion && ["access", "rectification", "suppression"].every((r) => m.privacy.dataSubjectRights.includes(r as never))),
      },
    ],
  },
  {
    id: "store",
    name: "Cumplimiento de tiendas",
    checks: [
      {
        id: "store-declarations",
        description: "Aviso profesional, política de privacidad y declaraciones de salud/seguridad de datos",
        points: 4,
        run: (m) => {
          const s = m.store;
          return { ratio: ratio([s.disclaimer.length > 20, !!s.privacyPolicyPath, s.appleHealthDataRules, s.playHealthDeclaration && s.dataSafetyDeclared].filter(Boolean).length, 4) };
        },
      },
    ],
  },
  {
    id: "evaluation",
    name: "Evaluación con casos de referencia",
    checks: [
      {
        id: "golden-count",
        description: "Casos de referencia suficientes",
        points: 2,
        run: (m, p) => ({ ratio: ratio(Math.min(m.evaluation.goldenCases.length, p.minGoldenCases), p.minGoldenCases) }),
      },
      {
        id: "taxonomy",
        description: "Taxonomía de errores con severidad (invención, omisión, negación, atribución)",
        points: 2,
        run: (m) => coverage(["fabrication", "omission", "negation", "attribution"], m.evaluation.errorTaxonomy.map((t) => t.id), "Errores"),
      },
      {
        id: "threshold-met",
        description: "Umbral de publicación alcanzado al ejecutar los casos",
        points: 2,
        run: (m, _p, e) => {
          if (!e) return { ratio: 0, detail: "casos no ejecutados" };
          const t = m.evaluation.releaseThreshold;
          return all(e.majorErrors <= t.maxMajorErrors && e.passRate >= t.minPassRate, `aprobados ${(e.passRate * 100).toFixed(0)}%, errores mayores ${e.majorErrors}`);
        },
      },
    ],
  },
  {
    id: "portability",
    name: "Portabilidad de la fábrica",
    checks: [
      {
        id: "generic-schema",
        description: "Valida contra el esquema genérico, con idioma, zona horaria y vocabulario propios",
        points: 2,
        run: (m) => all(consistencyProblems(m).length === 0 && !!m.locale && !!m.timezone && m.vocabulary.domainTerms.length >= 10, "vocabulario o coherencia insuficiente"),
      },
    ],
  },
];

export const RUBRIC_DIMENSIONS = DIMENSIONS.map((d) => ({
  id: d.id,
  name: d.name,
  weight: d.checks.reduce((s, c) => s + c.points, 0),
}));

export function scoreVertical(manifest: VerticalManifest, evaluation?: EvaluationReport): Scorecard {
  const profile = profileFor(manifest.profile);
  const dimensions: RubricDimension[] = DIMENSIONS.map((d) => {
    const checks = d.checks.map((c) => {
      const { ratio: r, detail } = c.run(manifest, profile, evaluation);
      return { id: c.id, description: c.description, points: c.points, earned: Math.round(c.points * r * 100) / 100, detail };
    });
    return {
      id: d.id,
      name: d.name,
      weight: checks.reduce((s, c) => s + c.points, 0),
      earned: Math.round(checks.reduce((s, c) => s + c.earned, 0) * 100) / 100,
      checks,
    };
  });
  const score = Math.round(dimensions.reduce((s, d) => s + d.earned, 0) * 10) / 10;
  const gateFailures = dimensions.filter((d) => profile.gateDimensions.includes(d.id) && d.earned < d.weight * 0.7).map((d) => d.id);
  return {
    verticalId: manifest.id,
    profile: profile.id,
    score,
    passingScore: profile.passingScore,
    passed: score >= profile.passingScore && gateFailures.length === 0,
    gateFailures,
    dimensions,
  };
}

export function formatScorecard(card: Scorecard): string {
  const lines = [`Vertical ${card.verticalId} (perfil ${card.profile}): ${card.score}/100 — ${card.passed ? "APROBADA" : "NO APROBADA"} (mínimo ${card.passingScore})`];
  for (const d of card.dimensions) {
    lines.push(`  ${d.earned.toString().padStart(5)}/${d.weight}  ${d.name}`);
    for (const c of d.checks) if (c.earned < c.points) lines.push(`         - ${c.description}: ${c.earned}/${c.points}${c.detail ? ` (${c.detail})` : ""}`);
  }
  if (card.gateFailures.length) lines.push(`  Compuerta: dimensiones bajo 70% → ${card.gateFailures.join(", ")}`);
  return lines.join("\n");
}
