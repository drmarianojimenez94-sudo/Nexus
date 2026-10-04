"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CLINICAL_TEMPLATES, type Patient } from "@nexus/shared";
import {
  executePlan,
  PlanExecutionError,
  type CapturePlan,
  type PlanStep,
  type Span,
} from "@nexus/verticals";
import { api } from "@/lib/api";
import { useDictation } from "@/lib/dictation";
import {
  apiFetcher,
  bindSubject,
  CLINICAL_HANDOFF_KEY,
  needsSubject,
  remainingSteps,
} from "@/lib/clinicalCapture";
import {
  ClinicalHeader,
  ClinicalError,
  clinicalButton,
  clinicalInput,
  clinicalSecondary,
} from "@/components/ClinicalUi";
import { ClinicalAssistPanel } from "@/components/ClinicalAssistPanel";

const DEFAULT_TEMPLATE = "visit";
const CAPTURE_TEMPLATES = CLINICAL_TEMPLATES.filter((t) => !t.archived);

type CaptureMode = "typed" | "dictated" | "ambient";
type PatientChoice = Pick<Patient, "id" | "name"> & { document?: string };

const MODES: Array<{ id: CaptureMode; label: string; detail: string }> = [
  { id: "typed", label: "Escribo yo", detail: "Texto escrito por vos." },
  {
    id: "dictated",
    label: "Dicto yo, sin el paciente",
    detail: "Tu propio dictado, al terminar la atención.",
  },
  {
    id: "ambient",
    label: "Conversación con el paciente",
    detail: "Requiere informar al paciente y su consentimiento.",
  },
];

const KIND_LABEL: Record<PlanStep["kind"], string> = {
  find_subject: "Ficha",
  create_subject: "Ficha nueva",
  create_record: "Consulta (borrador)",
  create_followup: "Seguimiento",
  create_appointment: "Turno",
  create_task: "Tarea",
};

/** Pasos ya ejecutados y el que falló, para reintentar sin duplicar. */
interface Recovery {
  steps: PlanStep[];
  selected: string[];
  completed: Record<string, string>;
  failedStepId: string;
  needsPatient: boolean;
  candidates: PatientChoice[];
}

function Evidence({ spans }: { spans: Span[] }) {
  if (!spans.length) return null;
  return (
    <p className="mt-1 text-xs text-nexus-muted">
      Dijiste:{" "}
      {spans.map((s, i) => (
        <span key={`${s.start}-${i}`}>
          {i > 0 && " · "}«
          <mark className="rounded bg-nexus-cyan/20 px-0.5 text-nexus-text">
            {s.text}
          </mark>
          »
        </span>
      ))}
    </p>
  );
}

function PatientPicker({
  candidates = [],
  onPick,
}: {
  candidates?: PatientChoice[];
  onPick: (p: PatientChoice) => void;
}) {
  const [q, setQ] = useState(""),
    [results, setResults] = useState<PatientChoice[]>([]),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<{ patients: Patient[] }>(
          `/clinical/patients?q=${encodeURIComponent(q.trim())}`,
        )
        .then((r) => {
          if (!cancelled) {
            setResults(r.patients);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled)
            setError(e instanceof Error ? e.message : "No se pudo buscar");
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);
  const list = [...candidates, ...results.filter((r) => !candidates.some((c) => c.id === r.id))];
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label="Buscar ficha"
        placeholder="Nombre o DNI…"
        className={clinicalInput}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ClinicalError message={error} />
      {list.map((p) => (
        <button
          key={p.id}
          type="button"
          className="rounded-xl border border-nexus-border p-3 text-left text-sm hover:border-nexus-cyan"
          onClick={() => onPick(p)}
        >
          <strong>{p.name}</strong>
          <span className="ml-2 text-xs text-nexus-muted">
            {p.document ? `Documento ${p.document}` : "Sin documento"}
          </span>
        </button>
      ))}
      <p className="text-xs text-nexus-muted">
        ¿No existe? <Link className="text-nexus-cyan" href="/patients/new">Creá la ficha</Link> y volvé a interpretar.
      </p>
    </div>
  );
}

function CaptureAssistant() {
  const params = useSearchParams();
  const contextId = params.get("patient") || undefined;
  const dictation = useDictation();
  const [mode, setMode] = useState<CaptureMode>("dictated"),
    [consent, setConsent] = useState(false),
    [text, setText] = useState(""),
    [plan, setPlan] = useState<CapturePlan | null>(null),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [chosen, setChosen] = useState<PatientChoice | null>(null),
    [contextPatient, setContextPatient] = useState<PatientChoice | null>(null),
    [recovery, setRecovery] = useState<Recovery | null>(null),
    [done, setDone] = useState<Record<string, string> | null>(null),
    [busy, setBusy] = useState(false),
    [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE),
    [error, setError] = useState<string | null>(null);
  const planTop = useRef<HTMLDivElement>(null);
  // Al armar la ficha, llevar la vista a lo que se va a guardar.
  useEffect(() => {
    if (plan) planTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [plan]);
  const template =
    CAPTURE_TEMPLATES.find((t) => t.id === templateId) ?? CAPTURE_TEMPLATES[0]!;

  // Texto derivado del asistente general: se usa una vez y se borra.
  useEffect(() => {
    try {
      const handoff = sessionStorage.getItem(CLINICAL_HANDOFF_KEY);
      if (handoff) {
        sessionStorage.removeItem(CLINICAL_HANDOFF_KEY);
        setText(handoff);
        setMode("dictated");
        // Desde el micrófono global se arma la ficha directo, sin otro toque.
        if (params.get("auto") === "1") void interpret(handoff);
      }
    } catch {
      // almacenamiento no disponible: se escribe a mano
    }
  }, []);

  useEffect(() => {
    if (!contextId) return;
    let cancelled = false;
    api
      .get<{ patient: Patient }>(`/clinical/patients/${encodeURIComponent(contextId)}`)
      .then((r) => {
        if (!cancelled) setContextPatient(r.patient);
      })
      .catch(() => {
        if (!cancelled) setError("No pude abrir la ficha indicada.");
      });
    return () => {
      cancelled = true;
    };
  }, [contextId]);

  const reset = () => {
    setPlan(null);
    setRecovery(null);
    setDone(null);
    setChosen(null);
  };
  const changeText = (value: string) => {
    setText(value);
    if (plan && !done) reset();
  };
  const micAllowed = mode === "dictated" || (mode === "ambient" && consent);

  async function interpret(override?: string) {
    const source = override ?? text;
    if (source.trim().length < 2) return;
    setError(null);
    reset();
    setBusy(true);
    try {
      const { plan } = await api.post<{ plan: CapturePlan }>(
        "/verticals/medicine/capture",
        {
          text: source,
          templateId,
          ...(contextId ? { subjectId: contextId } : {}),
          captureMode: mode,
          ...(mode === "ambient" ? { consentConfirmed: consent } : {}),
        },
      );
      setPlan(plan);
      setSelected(new Set(plan.steps.map((s) => s.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude interpretar el texto.");
    } finally {
      setBusy(false);
    }
  }

  async function run(steps: PlanStep[], ids: string[], base: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const created = await executePlan(steps, apiFetcher(api), ids);
      setRecovery(null);
      const saved = { ...base, ...created };
      setDone(saved);
    } catch (e) {
      if (!(e instanceof PlanExecutionError)) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
        return;
      }
      const completed = { ...base, ...e.completed };
      if (e.code === "missing_dependency" && !Object.keys(completed).length) {
        setRecovery(null);
        setError(e.message);
        return;
      }
      const needsPatient = e.code === "ambiguous_subject" || e.code === "subject_not_found";
      setRecovery({
        steps,
        selected: ids,
        completed,
        failedStepId: e.stepId,
        needsPatient,
        candidates: (e.candidates as PatientChoice[]).filter((c) => c && typeof c.id === "string"),
      });
      const saved = Object.keys(completed).length;
      setError(
        `${e.message}${saved ? ` Ya se guardaron ${saved} paso(s); no se repiten al reintentar.` : ""}`,
      );
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!plan) return;
    const ids = plan.steps.filter((s) => selected.has(s.id)).map((s) => s.id);
    if (!ids.length) {
      setError("Elegí al menos un paso para guardar.");
      return;
    }
    const steps = chosen ? bindSubject(plan.steps, chosen.id) : plan.steps;
    if (needsSubject(steps.filter((s) => ids.includes(s.id)))) {
      setError("Elegí la ficha del paciente antes de guardar.");
      return;
    }
    void run(steps, ids, {});
  }

  function retry(patient?: PatientChoice) {
    if (!recovery) return;
    const resolved = patient ? { [recovery.failedStepId]: patient.id } : {};
    let steps = remainingSteps(recovery.steps, recovery.completed, resolved);
    if (patient) {
      steps = bindSubject(steps, patient.id);
      setChosen(patient);
    }
    const ids = recovery.selected.filter((id) => steps.some((s) => s.id === id));
    void run(steps, ids, { ...recovery.completed, ...resolved });
  }

  const subjectStep = plan?.steps.find(
    (s) => s.kind === "find_subject" || s.kind === "create_subject",
  );
  const recordStep = plan?.steps.find((s) => s.kind === "create_record");
  const patientId =
    contextId ?? chosen?.id ?? (subjectStep && done ? done[subjectStep.id] : undefined);
  const encounterId = recordStep && done ? done[recordStep.id] : undefined;
  const redFlags = plan?.safety.redFlags.filter((r) => !r.negated) ?? [];
  const proposedFields = recordStep?.fields
    ? Object.fromEntries(recordStep.fields.map((f) => [f.key, f.value]))
    : {};
  const negated = plan?.safety.redFlags.filter((r) => r.negated) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title="Asistente clínico"
        detail="Escribí o dictá la atención. Nexus propone qué guardar y vos confirmás cada paso."
      />
      <details className="rounded-xl border border-nexus-border p-3 text-xs leading-relaxed text-nexus-muted">
        <summary className="cursor-pointer text-sm">Cómo cuida Nexus tus datos</summary>
        <p className="mt-2">
        Nada se guarda hasta que toques «Confirmar y guardar». Las consultas
        quedan como borrador: revisalas y validalas en la ficha. Nexus
        transcribe y ordena lo que dijiste; no diagnostica ni prescribe, y la
        interpretación se hace en el servidor de Nexus, sin IA externa. El
        panel «Asistente clínico IA» envía el caso sin nombre ni DNI para
        sugerir; podés ver exactamente qué se envió.
      </p>
      </details>
      {contextId && (
        <p className="rounded-xl border border-nexus-cyan/40 p-3 text-sm">
          Capturando en la ficha de{" "}
          <strong>{contextPatient?.name ?? "…"}</strong>.{" "}
          <Link className="text-nexus-cyan" href={`/patients/${contextId}`}>
            Volver a la ficha
          </Link>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
      <section className="glass-panel flex flex-col gap-3 p-4">
        {dictation.listening && (
          <p role="status" aria-live="polite" className="rounded-xl border border-nexus-danger/40 p-3 text-sm">
            <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-nexus-danger" />
            Escuchando. Hablá tranquilo: las pausas no cortan. Tocá <strong>Listo</strong> cuando termines.
            {dictation.text && <span className="mt-2 block text-nexus-muted">{dictation.text}</span>}
          </p>
        )}
        {dictation.error && <p role="alert" className="text-sm text-nexus-amber">{dictation.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {dictation.supported && (
            <button
              type="button"
              aria-pressed={dictation.listening}
              className={`inline-flex min-h-16 min-w-44 items-center justify-center gap-2 rounded-2xl px-6 text-lg font-semibold ${
                dictation.listening ? "bg-nexus-danger text-white" : "bg-nexus-cyan text-nexus-bg"
              } disabled:opacity-40`}
              disabled={busy || !micAllowed}
              onClick={() => {
                if (dictation.listening) {
                  const heard = dictation.stop();
                  const full = [text.trim(), heard].filter(Boolean).join(" ");
                  setText(full);
                  void interpret(full);
                } else {
                  reset();
                  dictation.start({
                    onAutoStop: (heard) => {
                      const full = [text.trim(), heard].filter(Boolean).join(" ");
                      setText(full);
                      void interpret(full);
                    },
                  });
                }
              }}
            >
              {dictation.listening ? "■ Listo" : "🎙 Dictar"}
            </button>
          )}
          <button
            type="button"
            className={dictation.supported ? clinicalSecondary : clinicalButton}
            disabled={busy || dictation.listening || text.trim().length < 2 || (mode === "ambient" && !consent)}
            onClick={() => void interpret()}
          >
            {busy && !plan ? "Armando…" : contextId ? "Armar consulta con el texto" : "Armar ficha con el texto"}
          </button>
        </div>
        <p className="text-xs text-nexus-muted">
          {dictation.supported
            ? mode === "typed"
              ? "Para usar el micrófono elegí «Dicto yo» o «Conversación con el paciente»."
              : "Dictá todo de corrido; al tocar Listo, Nexus arma la ficha para que la revises. Nada se guarda sin tu confirmación."
            : "Este navegador no ofrece dictado: usá el micrófono del teclado del celular."}
        </p>
        <label className="flex flex-col gap-2 text-sm">
          Texto de la atención
          <textarea
            rows={8}
            maxLength={8000}
            className={clinicalInput}
            value={text}
            disabled={busy}
            placeholder="Ej.: Paciente Ana Gómez, DNI 30.123.456. Motivo de consulta: tos de 3 días. Enfermedad actual: niega fiebre. Tratamiento: hidratación. Observaciones: control en una semana."
            onChange={(e) => changeText(e.target.value)}
          />
        </label>
        <div className="rounded-xl border border-nexus-cyan/30 p-3 text-sm">
          <p className="font-medium">Dictá libre, como se lo contarías a un colega</p>
          <p className="mt-1 text-xs text-nexus-muted">
            Empezá por el nombre y el DNI del paciente. Después contá la consulta en el orden que quieras: la IA
            reparte lo que dijiste en estas secciones.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {template.fields.map((f) => (
              <li
                key={f.key}
                className={`rounded-full border px-3 py-1 text-xs ${["reason", "present", "treatment", "observations"].includes(f.key) ? "border-nexus-cyan/60 text-nexus-cyan" : "border-nexus-border text-nexus-muted"}`}
              >
                {f.label}
              </li>
            ))}
          </ul>
        </div>
        <details className="rounded-xl border border-nexus-border p-3 text-sm">
          <summary className="cursor-pointer">
            Modo y plantilla: {MODES.find((m) => m.id === mode)?.label} · {template.name}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2" disabled={busy || dictation.listening}>
          <legend className="mb-2 text-sm font-medium">¿Cómo vas a cargarlo?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer flex-col rounded-xl border p-3 text-sm ${mode === m.id ? "border-nexus-cyan" : "border-nexus-border"}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="capture-mode"
                    checked={mode === m.id}
                    onChange={() => {
                      setMode(m.id);
                      setConsent(false);
                    }}
                  />
                  {m.label}
                </span>
                <span className="mt-1 text-xs text-nexus-muted">{m.detail}</span>
              </label>
            ))}
          </div>
          {mode === "ambient" && (
            <label className="flex items-start gap-3 rounded-xl border border-nexus-amber/40 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              El paciente fue informado y consintió que se registre la conversación
            </label>
          )}
        </fieldset>

        <label className="flex flex-col gap-2 text-sm">
          Plantilla
          <select
            className={clinicalInput}
            value={templateId}
            disabled={busy}
            onChange={(e) => {
              setTemplateId(e.target.value);
              if (plan && !done) reset();
            }}
          >
            {CAPTURE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
          </div>
        </details>
      </section>

      <ClinicalError message={error} />

      <div ref={planTop} className="scroll-mt-4" />
      {plan && (
        <>
          {redFlags.length > 0 && (
            <section role="alert" className="rounded-xl border-2 border-nexus-danger bg-nexus-danger/10 p-4">
              <h2 className="font-semibold text-nexus-danger">Signos de alarma</h2>
              <ul className="mt-2 flex flex-col gap-3">
                {redFlags.map((r, i) => (
                  <li key={`${r.id}-${i}`}>
                    <p className="font-medium text-nexus-danger">{r.label}</p>
                    <p className="text-sm">{r.escalation}</p>
                    <Evidence spans={[r.evidence]} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {plan.safety.allergyConflicts.length > 0 && (
            <section role="alert" className="rounded-xl border-2 border-nexus-danger p-4 text-sm">
              <h2 className="font-semibold text-nexus-danger">Posible conflicto con alergias</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {plan.safety.allergyConflicts.map((c, i) => (
                  <li key={i}>
                    {c.medication} · alergia registrada: {c.allergy}
                    <Evidence spans={[c.evidence]} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* Alarmas y conflictos ya se muestran arriba con su evidencia. */}
          {plan.warnings.some((w) => !w.startsWith("⚠")) && (
            <section className="rounded-xl border border-nexus-amber/40 p-3 text-sm text-nexus-amber">
              <ul className="flex flex-col gap-1">
                {plan.warnings.filter((w) => !w.startsWith("⚠")).map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            </section>
          )}
          {plan.safety.medications.length > 0 && (
            <section className="glass-panel p-4 text-sm">
              <h2 className="font-semibold">Medicación mencionada</h2>
              <p className="mt-1 text-xs text-nexus-muted">
                Las dosis se transcriben tal como las dijiste; Nexus no las
                sugiere. Verificalas antes de validar.
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {plan.safety.medications.map((m, i) => (
                  <li key={`${m.name}-${i}`}>
                    <strong>{m.name}</strong>
                    {m.dose != null && ` ${m.dose}${m.unit ? ` ${m.unit}` : ""}`}
                    {m.frequency && ` · ${m.frequency}`}
                    {!m.known && <span className="ml-2 text-xs text-nexus-amber">no reconocida</span>}
                    {m.issues.map((issue) => (
                      <p key={issue} className="text-xs text-nexus-amber">⚠ {issue}</p>
                    ))}
                    <Evidence spans={[m.evidence]} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {negated.length > 0 && (
            <p className="text-xs text-nexus-muted">
              Negados (no se escalan): {negated.map((r) => r.label).join(", ")}.
            </p>
          )}

          {plan.subject.mode === "missing" && !contextId && (
            <section className="glass-panel flex flex-col gap-2 p-4">
              <h2 className="font-semibold">¿De qué paciente es?</h2>
              {chosen ? (
                <p className="text-sm">
                  Ficha elegida: <strong>{chosen.name}</strong>{" "}
                  <button type="button" className="text-nexus-cyan" onClick={() => setChosen(null)}>
                    Cambiar
                  </button>
                </p>
              ) : (
                <PatientPicker onPick={setChosen} />
              )}
            </section>
          )}

          <section className="flex flex-col gap-3" aria-label="Pasos propuestos">
            <h2 className="font-semibold">Qué se va a guardar</h2>
            <p className={`text-xs ${plan.structuredBy === "ai" ? "text-nexus-cyan" : "text-nexus-muted"}`}>
              {plan.structuredBy === "ai"
                ? "🧠 La IA entendió tu relato y lo ordenó en las secciones (sin tu paciente: nombre y DNI no salen de Nexus). Revisá y confirmá."
                : "Ordenado con reglas: la IA no está configurada o no respondió. Revisá las secciones."}
            </p>
            {!plan.steps.length && (
              <p className="text-sm text-nexus-muted">
                No encontré nada para guardar. Revisá el texto.
              </p>
            )}
            {plan.steps.map((s) => (
              <label
                key={s.id}
                className={`glass-panel flex gap-3 p-4 ${selected.has(s.id) ? "" : "opacity-60"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={busy || !!done || (!!recovery && s.id in recovery.completed)}
                  checked={selected.has(s.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="hud-label text-nexus-cyan">{KIND_LABEL[s.kind]}</p>
                  <p className="font-medium">{s.summary}</p>
                  {(done?.[s.id] || recovery?.completed[s.id]) && (
                    <p className="text-xs text-nexus-cyan">✓ Guardado</p>
                  )}
                  {s.warnings.map((w) => (
                    <p key={w} className="text-xs text-nexus-amber">⚠ {w}</p>
                  ))}
                  {s.fields?.map((f) => (
                    <div key={f.key} className="mt-3 border-l-2 border-nexus-border pl-3">
                      <p className="text-xs uppercase tracking-wider text-nexus-muted">
                        {f.label}
                        {f.provisional && (
                          <span className="ml-2 rounded-full border border-nexus-amber/60 px-2 py-0.5 normal-case tracking-normal text-nexus-amber">
                            presuntivo
                          </span>
                        )}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{f.value}</p>
                      <Evidence spans={f.evidence} />
                    </div>
                  ))}
                  {!s.fields?.length && s.evidence.length > 0 && <Evidence spans={s.evidence} />}
                </div>
              </label>
            ))}
            {plan.unmapped.length > 0 && (
              <div className="rounded-xl border border-nexus-border p-3 text-sm">
                <p className="font-medium">Sin asignar (completalo en el borrador si corresponde)</p>
                <Evidence spans={plan.unmapped} />
              </div>
            )}
          </section>

          {recovery && (
            <section className="glass-panel flex flex-col gap-2 p-4">
              {recovery.needsPatient ? (
                <>
                  <h2 className="font-semibold">Elegí la ficha correcta</h2>
                  <PatientPicker candidates={recovery.candidates} onPick={(p) => retry(p)} />
                </>
              ) : (
                <button type="button" className={clinicalSecondary} disabled={busy} onClick={() => retry()}>
                  Reintentar los pasos pendientes
                </button>
              )}
            </section>
          )}

          {done ? (
            <section className="glass-panel flex flex-col gap-3 p-4">
              <h2 className="font-semibold">Guardado</h2>
              <p className="text-sm text-nexus-muted">
                {encounterId
                  ? "La consulta quedó como borrador: revisala y validala antes de darla por cerrada."
                  : "Se guardaron los pasos confirmados."}
              </p>
              {encounterId && (
                <p className="text-xs text-nexus-cyan">
                  Al validarla, Nexus aprende tu conducta para este cuadro (sin
                  datos del paciente).{" "}
                  <Link href="/brain" className="underline">
                    Ver 🧠 Lo que aprendí
                  </Link>
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                {patientId && encounterId && (
                  <Link
                    className={clinicalButton}
                    href={`/patients/${patientId}/consultations/${encounterId}`}
                  >
                    Revisar el borrador
                  </Link>
                )}
                {patientId && (
                  <Link className={clinicalSecondary} href={`/patients/${patientId}`}>
                    Abrir la ficha
                  </Link>
                )}
                <button
                  type="button"
                  className={clinicalSecondary}
                  onClick={() => {
                    reset();
                    setText("");
                  }}
                >
                  Nueva captura
                </button>
              </div>
            </section>
          ) : (
            !recovery && (
              <button
                type="button"
                className={clinicalButton}
                disabled={busy || selected.size === 0}
                onClick={confirm}
              >
                {busy ? "Guardando…" : "Confirmar y guardar"}
              </button>
            )
          )}
        </>
      )}
      </div>
      <ClinicalAssistPanel
        fields={proposedFields}
        text={plan ? "" : text}
        subjectId={contextId ?? chosen?.id}
        subjectName={plan?.subject.mode === "new" ? plan.subject.name : undefined}
      />
      </div>
    </div>
  );
}

export default function ClinicalCapturePage() {
  return (
    <Suspense fallback={<p role="status">Cargando asistente…</p>}>
      <CaptureAssistant />
    </Suspense>
  );
}
