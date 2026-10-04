import type { VerticalManifest } from "./manifest";
import { uuid, type PlanStep, type ProposedField, type VerticalAdapter } from "./plan";
import { analyzeSafety, type SafetyReport } from "./safety";
import { fold, resolveWhen, sentences, span, type Span } from "./text";

export interface CaptureContext {
  now: Date;
  /** Ficha abierta en la pantalla actual: la captura se asocia a ella. */
  subjectId?: string;
  subjectName?: string;
  knownAllergies?: string[];
  appointmentMinutes?: number;
  /** Plantilla elegida por el profesional (por ejemplo "visit"); si no, se infiere. */
  templateId?: string;
  /** Para pruebas reproducibles. */
  random?: () => number;
}

export interface CaptureSubject {
  mode: "context" | "new" | "lookup" | "missing";
  name?: string;
  document?: string;
  phone?: string;
  evidence: Span[];
}

export interface CapturePlan {
  verticalId: string;
  transcript: string;
  subject: CaptureSubject;
  templateId: string;
  steps: PlanStep[];
  safety: SafetyReport;
  warnings: string[];
  /** Cláusulas que no se asignaron a ningún campo: el profesional decide. */
  unmapped: Span[];
  requiresConfirmation: true;
}

const re = (p: string, flags = "") => new RegExp(p, flags);
/** Muletillas frecuentes en el dictado. */
const FILLER = "bueno|eh+|em+|este|a ver|o sea|digamos|perdon|mmm+";
const firstMatch = (folded: string, patterns: string[]) => {
  for (const p of patterns) {
    const m = re(p).exec(folded);
    if (m) return m;
  }
  return null;
};
const titleCase = (s: string) => s.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0]!.toUpperCase()}.`)
    .join(" ");

function extractSubject(source: string, folded: string, m: VerticalManifest, ctx: CaptureContext): CaptureSubject & { consumed: Span[] } {
  const consumed: Span[] = [];
  const evidence: Span[] = [];
  const doc = re(m.capture.documentCue.pattern).exec(folded);
  const document = doc ? doc[1]!.replace(/\D/g, "") : undefined;
  if (doc) {
    const e = span(source, doc.index, doc.index + doc[0].length);
    evidence.push(e);
    consumed.push(e);
  }
  const phoneMatch = /\b(?:tel(?:efono)?|cel(?:ular)?|whatsapp)\.?\s*:?\s*(\+?\d[\d\s-]{5,18}\d)/.exec(folded);
  const phone = phoneMatch ? phoneMatch[1]!.replace(/\s+/g, " ").trim() : undefined;
  if (phoneMatch) {
    const e = span(source, phoneMatch.index, phoneMatch.index + phoneMatch[0].length);
    evidence.push(e);
    consumed.push(e);
  }
  const isNew = !!firstMatch(folded, m.capture.newSubjectCues);
  if (ctx.subjectId) return { mode: "context", name: ctx.subjectName, document, phone, evidence, consumed };

  const stop = new Set(m.capture.nameStopWords.map(fold));
  const cue = re(`\\b(?:${m.capture.subjectCues.join("|")})\\b\\.?((?:\\s+(?:nuev[oa]|de\\s+primera\\s+vez|de\\s+nombre|llamad[oa]|se\\s+llama))*)\\s+`, "g");
  let c: RegExpExecArray | null;
  while ((c = cue.exec(folded))) {
    let pos = c.index + c[0].length;
    const words: Span[] = [];
    const wordRe = /[a-zñ'-]+/y;
    // Si el dictado trae mayúsculas, el nombre termina en la primera palabra en minúscula.
    const capitalized = (at: number) => /\p{Lu}/u.test(source[at] ?? "");
    let usesCaps = false;
    while (words.length < 6) {
      wordRe.lastIndex = pos;
      const w = wordRe.exec(folded);
      if (!w || w[0].length < 2) break;
      // "Quiroga de Martínez": conector en minúscula entre apellidos con mayúscula.
      const connector = usesCaps && /^(?:de|del|la)$/.test(w[0]);
      const after = connector ? /^\s+(?:la\s+)?([a-zñ'-]+)/.exec(folded.slice(w.index + w[0].length)) : null;
      if (connector && after && capitalized(w.index + w[0].length + after[0].indexOf(after[1]!))) {
        words.push(span(source, w.index, w.index + w[0].length));
        pos = w.index + w[0].length;
        const gap = /^\s+/.exec(folded.slice(pos));
        if (!gap) break;
        pos += gap[0].length;
        continue;
      }
      if (stop.has(w[0])) break;
      if (!words.length) usesCaps = capitalized(w.index);
      else if (usesCaps && !capitalized(w.index)) break;
      words.push(span(source, w.index, w.index + w[0].length));
      pos = w.index + w[0].length;
      const gap = /^\s+/.exec(folded.slice(pos));
      if (!gap) break;
      pos += gap[0].length;
    }
    if (words.length) {
      const name = titleCase(words.map((w) => w.text).join(" "));
      const e = span(source, c.index, words[words.length - 1]!.end);
      evidence.push(e);
      consumed.push(e);
      return { mode: isNew ? "new" : "lookup", name, document, phone, evidence, consumed };
    }
  }
  return { mode: "missing", document, phone, evidence, consumed };
}

function pickTemplate(folded: string, m: VerticalManifest, isNew: boolean): string {
  for (const rule of m.capture.templateRules) if (firstMatch(folded, rule.patterns)) return rule.templateId;
  return isNew ? m.capture.newSubjectTemplate : m.capture.defaultTemplate;
}

/**
 * Convierte un dictado o texto libre en un plan revisable. Determinístico:
 * no llama a ningún modelo, de modo que datos sensibles no salen del
 * servidor de NEXUS. Cada dato propuesto conserva el fragmento del texto
 * que lo respalda (evidencia) y queda como borrador para revisión humana.
 */
export function interpretCapture(source: string, manifest: VerticalManifest, adapter: VerticalAdapter, ctx: CaptureContext): CapturePlan {
  const text = source.trim();
  const folded = fold(text);
  const id = () => uuid(ctx.random);
  const warnings: string[] = [];
  const steps: PlanStep[] = [];
  const subject = extractSubject(text, folded, manifest, ctx);
  const consumed: Span[] = [...subject.consumed];
  const safety = analyzeSafety(text, manifest, ctx.knownAllergies);
  const templateId = ctx.templateId && manifest.templates.some((t) => t.id === ctx.templateId) ? ctx.templateId : pickTemplate(folded, manifest, subject.mode === "new");
  const template = manifest.templates.find((t) => t.id === templateId)!;
  const templateKeys = new Set(template.sections.map((s) => s.key));
  const target = (targets: string[]) => targets.find((t) => templateKeys.has(t));
  const fields = new Map<string, ProposedField>();
  const put = (key: string | undefined, value: string, evidence: Span, provisional = false) => {
    if (!key || !value.trim()) return false;
    const section = template.sections.find((s) => s.key === key)!;
    const existing = fields.get(key);
    if (existing) {
      existing.value = `${existing.value}. ${value.trim()}`;
      existing.evidence.push(evidence);
      existing.provisional ||= provisional;
    } else fields.set(key, { key, label: section.label, value: value.trim(), evidence: [evidence], source: "rules", requiresReview: true, provisional: provisional || undefined });
    return true;
  };

  // 1. Subject step.
  let subjectStep: string | null = null;
  if (subject.mode === "new" && subject.name) {
    subjectStep = id();
    const allergies = safety.allergies.join(", ");
    steps.push({
      id: subjectStep,
      kind: "create_subject",
      summary: `Crear ficha de ${manifest.vocabulary.subject.singular}: ${subject.name}${subject.document ? ` (${manifest.capture.documentCue.label} ${subject.document})` : ""}`,
      permissionLevel: 4,
      ...adapter.createSubject({ name: subject.name, document: subject.document, phone: subject.phone, allergies, clientId: id() }),
      evidence: subject.evidence,
      warnings: subject.document ? [] : [`Sin ${manifest.capture.documentCue.label}: la ficha se identifica solo por nombre.`],
      dependsOn: [],
    });
  } else if (subject.mode === "lookup" && subject.name) {
    subjectStep = id();
    steps.push({
      id: subjectStep,
      kind: "find_subject",
      summary: `Buscar la ficha de ${subject.name}`,
      permissionLevel: 1,
      ...adapter.findSubject(subject.document ?? subject.name),
      evidence: subject.evidence,
      warnings: [],
      dependsOn: [],
    });
  } else if (subject.mode === "missing") {
    warnings.push(`No identifiqué a qué ${manifest.vocabulary.subject.singular} corresponde: elegí la ficha antes de guardar.`);
  }
  /** Resuelve `$subject` del adaptador: id de contexto, paso previo o pendiente. */
  const bindSubject = <T extends Pick<PlanStep, "request" | "bind">>(step: T): T & { dependsOn: string[] } => {
    const bind: Record<string, string> = {};
    let path = step.request.path;
    const body = step.request.body ? { ...step.request.body } : undefined;
    for (const [field, ref] of Object.entries(step.bind ?? {})) {
      if (ref !== "$subject") bind[field] = ref;
      else if (ctx.subjectId) {
        if (field.startsWith("path.")) path = path.replace(field.slice(5), encodeURIComponent(ctx.subjectId));
        else if (body) body[field.replace(/^body\./, "")] = ctx.subjectId;
      } else if (subjectStep) bind[field] = `$${subjectStep}`;
      else bind[field] = "$subject";
    }
    return { ...step, request: { ...step.request, path, body }, bind, dependsOn: subjectStep && !ctx.subjectId ? [subjectStep] : [] };
  };

  // 2a. Secciones rotuladas: "Enfermedad actual: …" va entero a su campo.
  const labelHits: Array<{ start: number; contentStart: number; targets: string[] }> = [];
  for (const label of manifest.capture.sectionLabels) {
    // Al comienzo de una oración el rótulo vale con o sin dos puntos
    // ("Tratamiento ibuprofeno…"); después de una coma, solo si es inequívoco.
    const patterns = [
      `(?:^|[.;\\n]\\s*)((?:${FILLER}[\\s,]+)*)(${label.pattern})\\b\\s*${label.requiresColon && !label.sentenceStart ? ":" : ":?"}\\s*`,
      `,\\s*()(${label.pattern})\\b\\s*${label.requiresColon ? ":" : ":?"}\\s*`,
    ];
    for (const p of patterns) {
      const lre = new RegExp(p, "g");
      let lm: RegExpExecArray | null;
      while ((lm = lre.exec(folded))) {
        const start = lm.index + lm[0].indexOf(lm[2]!, lm[0].indexOf(lm[1]!) + lm[1]!.length);
        if (!labelHits.some((h) => h.start === start)) labelHits.push({ start, contentStart: lm.index + lm[0].length, targets: label.targets });
      }
    }
  }
  labelHits.sort((a, b) => a.start - b.start);
  const regions = labelHits.map((h, i) => ({ start: h.start, end: labelHits[i + 1]?.start ?? text.length, contentStart: h.contentStart, targets: h.targets }));
  for (const r of regions) {
    const raw = text.slice(r.contentStart, r.end);
    const value = raw.trim().replace(/[.;,\s]+$/, "");
    const lead = raw.length - raw.trimStart().length;
    if (value.length >= 2) put(target(r.targets), value, span(text, r.contentStart + lead, r.contentStart + lead + value.length));
  }
  const inRegion = (s: Span) => regions.some((r) => s.start >= r.start && s.start < r.end);

  // 2b. Clause-level mapping.
  const followupSpans: Array<{ kind: string; title: string; clause: Span; when: ReturnType<typeof resolveWhen> }> = [];
  const unmapped: Span[] = [];
  for (const clause of segments(text, folded, manifest)) {
    const f = folded.slice(clause.start, clause.end);
    const inClause = (s: Span) => s.start >= clause.start && s.end <= clause.end;
    const remainderStart = Math.max(clause.start, ...consumed.filter(inClause).map((s) => s.end));
    let used = false;

    // Appointment with explicit time → calendar.
    if (firstMatch(f, manifest.capture.appointmentCues)) {
      const when = resolveWhen(clause.text, f, ctx.now, manifest.timezone);
      if (when?.hasTime) {
        const minutes = ctx.appointmentMinutes ?? 30;
        const who = subject.name ? (manifest.privacy.appointmentTitles === "initials" ? initials(subject.name) : manifest.privacy.appointmentTitles === "full_name" ? subject.name : "") : "";
        const title = `${titleCase(manifest.vocabulary.appointment.singular)}${who ? ` · ${who}` : ""}`;
        steps.push({
          id: id(),
          kind: "create_appointment",
          summary: `Agendar ${manifest.vocabulary.appointment.singular} ${formatLocal(when.at, manifest)}`,
          permissionLevel: 2,
          ...adapter.createAppointment({ title, startAt: when.at.toISOString(), endAt: new Date(when.at.getTime() + minutes * 60_000).toISOString() }),
          evidence: [clause],
          warnings: [],
          dependsOn: [],
        });
        continue;
      }
    }

    // Follow-ups.
    // "no la cito", "no hace falta control": un pendiente negado no se propone.
    // Si la cláusula tiene varias señales, manda la que aparece primero
    // ("control en 30 días con resultados" es un control).
    const rule = manifest.capture.followupRules
      .map((r, order) => {
        const hits = r.patterns.map((p) => re(p).exec(f)).filter((m): m is RegExpExecArray => !!m && !/\b(?:no|sin|ni)\s+(?:[a-z]+\s+)?$/.test(f.slice(Math.max(0, m.index - 14), m.index)));
        return hits.length ? { r, order, at: Math.min(...hits.map((m) => m.index)) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.at - b.at || a.order - b.order)[0]?.r;
    if (rule) {
      // "en 10 días, no, perdón, mejor en una semana": vale lo último que se dijo.
      const fix = /^(.*)\b(?:perdon|corrijo|mejor dicho|mejor|o sea)\b/.exec(f);
      const offset = fix ? fix[0].length : 0;
      const when = (fix && resolveWhen(clause.text.slice(offset), f.slice(offset), ctx.now, manifest.timezone)) || resolveWhen(clause.text, f, ctx.now, manifest.timezone);
      followupSpans.push({ kind: rule.kind, title: rule.title, clause, when });
      if (!inRegion(clause)) put(target(manifest.capture.followupTargets), clause.text, clause);
      used = true;
    }
    // Dentro de una sección rotulada el texto ya está en su campo.
    if (inRegion(clause)) continue;

    // Measurements (se quitan del texto antes de buscar secciones).
    let masked = f;
    for (const meas of manifest.capture.measurements) {
      const mm = re(meas.pattern).exec(masked);
      if (!mm) continue;
      const value = mm.slice(1).filter(Boolean).join("/");
      const ev = span(text, clause.start + mm.index, clause.start + mm.index + mm[0].length);
      if (put(target(meas.targets), `${meas.label} ${value}${meas.unit ? ` ${meas.unit}` : ""}`, ev)) {
        used = true;
        masked = masked.slice(0, mm.index) + " ".repeat(mm[0].length) + masked.slice(mm.index + mm[0].length);
      }
    }

    // Section cues: el texto que sigue a la señal va a la sección.
    if (!rule)
      for (const cue of manifest.capture.sectionCues) {
        const cm = firstMatch(masked, cue.patterns);
        if (!cm) continue;
        const startInClause = cm.index + cm[0].length;
        const tail = masked.slice(startInClause);
        const lead = tail.length - tail.replace(/^[\s:,-]+/, "").length;
        const absStart = clause.start + startInClause + lead;
        const value = text.slice(absStart, clause.end).trim();
        if (value.length < 2 || !tail.trim()) continue;
        used = put(target(cue.targets), value, span(text, absStart, clause.end), cue.provisional) || used;
        break;
      }

    if (!used) {
      const rest = text.slice(remainderStart, clause.end).replace(/^[\s,:-]+/, "");
      const restStart = clause.end - rest.length;
      // Muletillas del dictado ("bueno, eh, a ver") no son contenido.
      if (rest.replace(new RegExp(`\\b(?:${FILLER})\\b`, "gi"), "").replace(/[\s,.;:]+/g, "").length >= 3) {
        // Relato libre (incluidas negaciones pertinentes): va a la sección subjetiva/motivo.
        if (!put(target(manifest.capture.fallbackTargets), rest, span(text, restStart, clause.end))) unmapped.push(span(text, restStart, clause.end));
      }
    }
  }

  // Sin rótulos, el relato que trae el motivo es también el comienzo de la
  // enfermedad actual ("Viene por ardor al orinar y polaquiuria de 2 días").
  const reason = fields.get("reason");
  const presentLabeled = fields.get("present")?.evidence.some(inRegion) ?? false;
  if (reason && templateKeys.has("present") && !presentLabeled) {
    const first = reason.evidence[0]!;
    const sentence = sentences(text).find((s) => first.start >= s.start && first.start < s.end);
    const present = fields.get("present");
    if (sentence && !present?.value.includes(sentence.text)) {
      if (present) {
        present.value = `${sentence.text}. ${present.value}`;
        present.evidence.unshift(sentence);
      } else put("present", sentence.text, sentence);
    }
  }

  // 3. Record (draft) step.
  let recordStep: string | null = null;
  if (fields.size) {
    recordStep = id();
    const proposed = [...fields.values()];
    const stepWarnings: string[] = [];
    if (proposed.some((p) => p.provisional)) stepWarnings.push("La impresión diagnóstica queda como presuntiva: confirmala o corregila (CIE-10) al revisar.");
    steps.push({
      id: recordStep,
      kind: "create_record",
      summary: `Borrador de ${manifest.vocabulary.record.singular} (${template.name}) con ${proposed.length} campo${proposed.length === 1 ? "" : "s"}`,
      permissionLevel: 4,
      ...bindSubject(adapter.createRecord({
        templateId,
        occurredAt: ctx.now.toISOString(),
        fields: Object.fromEntries(proposed.map((p) => [p.key, p.value])),
        // La transcripción viaja con el borrador: hay que revisarla y vaciarla para validar.
        dictation: text,
        clientId: id(),
      })),
      fields: proposed,
      evidence: proposed.flatMap((p) => p.evidence),
      warnings: stepWarnings,
    });
  }

  // 4. Follow-ups. Un pedido sin fecha seguido de "resultados el jueves" o
  // "la vemos el viernes" en la misma oración es un solo pendiente con fecha.
  const merged: typeof followupSpans = [];
  for (const fu of followupSpans) {
    const prev = merged[merged.length - 1];
    const sameSentence = prev && !/[.;\n]/.test(text.slice(prev.clause.end, fu.clause.start));
    const weak = /\b(?:la|lo|los|las) (?:vemos|veo)\b|^\s*(?:vemos\s+(?:los\s+)?)?resultados?\b/.test(fold(fu.clause.text));
    if (prev && !prev.when && fu.when && ((sameSentence && prev.kind === fu.kind) || (weak && prev.kind === "RESULT"))) {
      prev.when = fu.when;
      prev.clause = span(text, prev.clause.start, fu.clause.end);
      continue;
    }
    // "Se pide TSH en 6 semanas y control con el resultado": misma fecha.
    if (prev && sameSentence && prev.when && !fu.when) {
      merged.push({ ...fu, when: prev.when });
      continue;
    }
    merged.push({ ...fu });
  }
  for (const fu of merged) {
    const assumed = !fu.when;
    const due = fu.when?.at ?? new Date(ctx.now.getTime() + 7 * 86_400_000);
    const title = `${fu.title}: ${fu.clause.text}`.slice(0, 300);
    steps.push({
      id: id(),
      kind: "create_followup",
      summary: `${fu.title} para el ${formatLocal(due, manifest, false)}${assumed ? " (fecha asumida)" : ""}`,
      permissionLevel: 4,
      ...bindSubject(adapter.createFollowup({ title, kind: fu.kind, dueAt: due.toISOString(), clientId: id() })),
      evidence: [fu.clause],
      warnings: assumed ? ["No se dijo cuándo: propuse 7 días. Confirmá o cambiá la fecha."] : [],
    });
  }

  // Una búsqueda de ficha sin pasos que la usen solo podría fallar: se quita.
  if (subjectStep && subject.mode === "lookup" && !steps.some((s) => s.dependsOn.includes(subjectStep!)))
    steps.splice(steps.findIndex((s) => s.id === subjectStep), 1);
  for (const s of steps)
    if (Object.values(s.bind ?? {}).includes("$subject")) s.warnings.push(`Elegí la ficha del ${manifest.vocabulary.subject.singular} para poder guardar este paso.`);

  // 5. Safety warnings bubble up.
  for (const r of safety.redFlags.filter((r) => !r.negated)) warnings.push(`⚠ ${r.label}: ${r.escalation}`);
  for (const med of safety.medications) for (const issue of med.issues) warnings.push(`Medicación «${med.evidence.text}»: ${issue}.`);
  for (const c of safety.allergyConflicts) warnings.push(`⚠ Posible conflicto: ${c.medication} con alergia registrada a ${c.allergy}.`);
  if (!steps.length) warnings.push("No encontré nada para registrar. Probá con: «paciente nuevo Ana Gómez, consulta por…».");

  return { verticalId: manifest.id, transcript: text, subject, templateId, steps, safety, warnings, unmapped, requiresConfirmation: true };
}

export function formatLocal(at: Date, m: VerticalManifest, withTime = true): string {
  return new Intl.DateTimeFormat(m.locale, {
    timeZone: m.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(at);
}

/**
 * Oraciones divididas además por comas cuando lo que sigue empieza con una
 * señal conocida ("…, niega fiebre, TA 150/95, control en 2 semanas"). Las
 * enumeraciones sin señal ("cefalea, fiebre y tos") quedan juntas.
 */
export function segments(text: string, folded: string, m: VerticalManifest): Span[] {
  const starters = [
    ...m.capture.sectionCues.flatMap((c) => c.patterns),
    ...m.capture.measurements.map((x) => x.pattern),
    ...m.capture.followupRules.flatMap((x) => x.patterns),
    ...m.capture.appointmentCues,
    ...m.safety.negationCues.map((c) => `\\b${c}\\b`),
    ...m.capture.subjectCues.map((c) => `\\b${c}\\b`),
    m.capture.documentCue.pattern,
    "\\b(?:tel|telefono|cel|celular)\\b",
  ].map((p) => re(`^(?:${p})`));
  const out: Span[] = [];
  for (const sentence of sentences(text)) {
    const f = folded.slice(sentence.start, sentence.end);
    let segStart = 0;
    const cut = /,\s*(?:y\s+)?|\s+y\s+/g;
    let c: RegExpExecArray | null;
    while ((c = cut.exec(f))) {
      const next = f.slice(c.index + c[0].length);
      if (starters.some((s) => s.test(next))) {
        out.push(span(text, sentence.start + segStart, sentence.start + c.index));
        segStart = c.index + c[0].length;
      }
    }
    out.push(span(text, sentence.start + segStart, sentence.end));
  }
  return out.filter((s) => s.text.trim().length > 0);
}
