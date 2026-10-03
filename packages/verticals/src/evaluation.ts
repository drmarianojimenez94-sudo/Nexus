import { interpretCapture, type CapturePlan } from "./capture";
import type { GoldenCase, VerticalManifest } from "./manifest";
import type { VerticalAdapter } from "./plan";
import { fold, zonedParts } from "./text";

export type ErrorType = "fabrication" | "omission" | "negation" | "attribution" | "template" | "timing" | "medication";
export interface CaseError {
  type: ErrorType;
  severity: "major" | "minor";
  detail: string;
}
export interface CaseResult {
  id: string;
  passed: boolean;
  errors: CaseError[];
}
export interface EvaluationReport {
  verticalId: string;
  cases: number;
  passed: number;
  passRate: number;
  majorErrors: number;
  minorErrors: number;
  /** Fracción de datos propuestos cuya evidencia coincide literalmente con la transcripción. */
  evidenceCoverage: number;
  results: CaseResult[];
}

const contains = (haystack: string, needle: string) => fold(haystack).includes(fold(needle));
const localDay = (iso: string, tz: string) => {
  const p = zonedParts(new Date(iso), tz);
  return Date.UTC(p.year, p.month - 1, p.day);
};

function checkCase(c: GoldenCase, plan: CapturePlan, m: VerticalManifest, now: Date): CaseError[] {
  const errors: CaseError[] = [];
  const e = c.expect;
  const record = plan.steps.find((s) => s.kind === "create_record");
  const fieldValues = record?.fields ?? [];
  if (e.subjectName !== undefined && fold(plan.subject.name ?? "") !== fold(e.subjectName))
    errors.push({ type: "attribution", severity: "major", detail: `persona «${plan.subject.name ?? "—"}», esperada «${e.subjectName}»` });
  if (e.document !== undefined && plan.subject.document !== e.document)
    errors.push({ type: "attribution", severity: "major", detail: `documento ${plan.subject.document ?? "—"}, esperado ${e.document}` });
  if (e.templateId && plan.templateId !== e.templateId) errors.push({ type: "template", severity: "minor", detail: `plantilla ${plan.templateId}, esperada ${e.templateId}` });
  for (const [key, value] of Object.entries(e.fields ?? {})) {
    const f = fieldValues.find((x) => x.key === key);
    if (!f || !contains(f.value, value)) errors.push({ type: "omission", severity: "minor", detail: `campo ${key} sin «${value}» (tiene «${f?.value ?? ""}»)` });
  }
  const followups = plan.steps.filter((s) => s.kind === "create_followup");
  const today = localDay(now.toISOString(), m.timezone);
  for (const fu of e.followups ?? []) {
    const hit = followups.find((s) => s.request.body?.kind === fu.kind && Math.round((localDay(String(s.request.body?.dueAt), m.timezone) - today) / 86_400_000) === fu.inDays);
    if (!hit) {
      const sameKind = followups.some((s) => s.request.body?.kind === fu.kind);
      errors.push({ type: sameKind ? "timing" : "omission", severity: sameKind ? "minor" : "major", detail: `seguimiento ${fu.kind} a ${fu.inDays} días` });
    }
  }
  if (e.followups && followups.length > e.followups.length) errors.push({ type: "fabrication", severity: "minor", detail: `${followups.length - e.followups.length} seguimiento(s) de más` });
  if (e.appointmentAt) {
    const appt = plan.steps.find((s) => s.kind === "create_appointment");
    const p = appt ? zonedParts(new Date(String(appt.request.body?.startAt)), m.timezone) : null;
    const got = p ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` : "—";
    if (got !== e.appointmentAt) errors.push({ type: "timing", severity: "major", detail: `turno ${got}, esperado ${e.appointmentAt}` });
  }
  const activeFlags = plan.safety.redFlags.filter((r) => !r.negated).map((r) => r.id);
  for (const id of e.redFlags ?? []) if (!activeFlags.includes(id)) errors.push({ type: "omission", severity: "major", detail: `señal de alarma ${id} no detectada` });
  if (e.redFlags) for (const id of activeFlags) if (!e.redFlags.includes(id)) errors.push({ type: "fabrication", severity: "minor", detail: `señal de alarma ${id} no esperada` });
  for (const term of e.negated ?? []) {
    const negatedOk = plan.safety.negations.some((n) => n.terms.some((t) => contains(t, term) || contains(term, t)));
    const flagged = plan.safety.redFlags.some((r) => !r.negated && contains(r.evidence.text, term));
    if (!negatedOk || flagged) errors.push({ type: "negation", severity: "major", detail: `«${term}» debía quedar negado` });
  }
  for (const med of e.medications ?? []) {
    const hit = plan.safety.medications.find((x) => fold(x.name) === fold(med.name));
    if (!hit) errors.push({ type: "omission", severity: "major", detail: `medicación ${med.name} no detectada` });
    else if (med.flagged !== hit.issues.length > 0) errors.push({ type: "medication", severity: med.flagged ? "major" : "minor", detail: `medicación ${med.name} ${med.flagged ? "debía" : "no debía"} marcarse` });
  }
  for (const med of e.allergyConflicts ?? [])
    if (!plan.safety.allergyConflicts.some((c) => fold(c.medication) === fold(med))) errors.push({ type: "omission", severity: "major", detail: `conflicto de alergia con ${med} no detectado` });
  const produced = [...fieldValues.map((f) => f.value), ...followups.map((s) => String(s.request.body?.title ?? ""))].join(" | ");
  for (const bad of e.mustNotContain ?? []) if (contains(produced, bad)) errors.push({ type: "fabrication", severity: "major", detail: `contiene «${bad}»` });
  return errors;
}

export function evaluateVertical(m: VerticalManifest, adapter: VerticalAdapter): EvaluationReport {
  const now = new Date(m.evaluation.referenceNow);
  let evidenceTotal = 0;
  let evidenceOk = 0;
  const results: CaseResult[] = m.evaluation.goldenCases.map((c, i) => {
    let seed = i + 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const plan = interpretCapture(c.utterance, m, adapter, { now, random });
    for (const step of plan.steps)
      for (const ev of [...step.evidence, ...(step.fields ?? []).flatMap((f) => f.evidence)]) {
        evidenceTotal++;
        if (ev.text.length > 0 && plan.transcript.slice(ev.start, ev.end) === ev.text) evidenceOk++;
      }
    for (const f of plan.steps.flatMap((s) => s.fields ?? [])) {
      // Toda la información propuesta debe tener evidencia.
      evidenceTotal++;
      if (f.evidence.length) evidenceOk++;
    }
    const errors = checkCase(c, plan, m, now);
    return { id: c.id, passed: !errors.some((x) => x.severity === "major") && errors.length <= 1, errors };
  });
  const passed = results.filter((r) => r.passed).length;
  const all = results.flatMap((r) => r.errors);
  return {
    verticalId: m.id,
    cases: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    majorErrors: all.filter((x) => x.severity === "major").length,
    minorErrors: all.filter((x) => x.severity === "minor").length,
    evidenceCoverage: evidenceTotal ? evidenceOk / evidenceTotal : 0,
    results,
  };
}
