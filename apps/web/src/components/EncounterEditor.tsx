"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CLINICAL_TEMPLATES,
  type Patient,
  type ClinicalTemplate,
  type ClinicalEncounter,
  type EncounterInput,
} from "@nexus/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useSpeech } from "@/lib/useSpeech";
import {
  readClinicalDraft,
  saveClinicalDraft,
  removeClinicalDraft,
} from "@/lib/clinicalDrafts";
import {
  ClinicalError,
  ClinicalHeader,
  clinicalInput,
  clinicalButton,
  clinicalSecondary,
} from "./ClinicalUi";

interface DraftSnapshot {
  input: EncounterInput;
  template: ClinicalTemplate;
  patient: Patient;
  clientId: string;
  version: number;
  encounterId?: string;
}
export function EncounterEditor({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId?: string;
}) {
  const { user } = useAuth(),
    router = useRouter(),
    slot = `${patientId}:${encounterId || "new"}`;
  const [patient, setPatient] = useState<Patient | null>(null),
    [templates, setTemplates] =
      useState<ClinicalTemplate[]>(CLINICAL_TEMPLATES),
    [template, setTemplate] = useState<ClinicalTemplate>(
      CLINICAL_TEMPLATES[0]!,
    );
  const [input, setInput] = useState<EncounterInput>({
    templateId: "first",
    occurredAt: new Date().toISOString(),
    fields: {},
    dictation: "",
  });
  const [version, setVersion] = useState(1),
    [status, setStatus] = useState("DRAFT"),
    [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [confirming, setConfirming] = useState(false),
    [recovered, setRecovered] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [localStatus, setLocalStatus] = useState(""),
    [serverStatus, setServerStatus] = useState(""),
    [target, setTarget] = useState("");
  const clientId = useRef(""),
    draftWrites = useRef<Promise<void>>(Promise.resolve()),
    validationDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!confirming || !validationDialog.current) return;
    const dialog = validationDialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [confirming]);
  const {
    startListening,
    stopListening,
    listening,
    sttSupported,
    interimTranscript,
    error: speechError,
  } = useSpeech();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      let local: DraftSnapshot | null = null;
      try {
        local = await readClinicalDraft<DraftSnapshot>(user.id, slot);
      } catch {
        if (!cancelled)
          setLocalStatus(
            "No se pudo recuperar el borrador local. Revisá el almacenamiento del dispositivo.",
          );
      }
      try {
        const result: { patient: Patient; encounter?: ClinicalEncounter } =
          encounterId
            ? await api.get<{ patient: Patient; encounter: ClinicalEncounter }>(
                `/clinical/encounters/${encounterId}`,
              )
            : await api.get<{ patient: Patient }>(
                `/clinical/patients/${patientId}`,
              );
        if (result.patient.id !== patientId)
          throw new Error("La consulta no corresponde a este paciente");
        const c = result.encounter || null;
        const list = await api.get<{ templates: ClinicalTemplate[] }>(
          "/clinical/templates",
        );
        if (cancelled) return;
        setPatient(result.patient);
        setTemplates(list.templates);
        clientId.current = crypto.randomUUID();
        if (c) {
          setTemplate(c.template);
          setInput({
            templateId: c.templateId,
            occurredAt: c.occurredAt,
            fields: c.fields,
            dictation: c.dictation,
          });
          setVersion(c.version);
          setStatus(c.status);
          setServerStatus(
            c.status === "FINAL"
              ? "Consulta validada. Se conserva esta versión."
              : "Borrador guardado en Nexus",
          );
        }
        if (local && (!c || c.status === "DRAFT")) {
          setTemplate(local.template);
          setInput(local.input);
          clientId.current = local.clientId;
          setVersion(local.version);
          setDirty(true);
          setRecovered(true);
          if (c && c.version !== local.version)
            setError(
              "Existe una versión más reciente en Nexus. Tu borrador se conserva; copiá lo que necesites antes de recargar. No se sobrescribirá la otra versión.",
            );
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        // Only network/server failures may restore a local draft; a forbidden or
        // deleted record must not become readable through a stale recovery path.
        const code =
          err && typeof err === "object" && "status" in err
            ? Number(err.status)
            : 0;
        if (local && (!code || code >= 500)) {
          setPatient(local.patient);
          setTemplate(local.template);
          setInput(local.input);
          clientId.current = local.clientId;
          setVersion(local.version);
          setDirty(true);
          setRecovered(true);
          setReady(true);
          setServerStatus(
            "Sin conexión. Borrador local recuperado; guardá en Nexus cuando vuelva internet.",
          );
        } else
          setError(
            err instanceof Error ? err.message : "No se pudo abrir la consulta",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slot, patientId, encounterId]);
  useEffect(() => {
    if (!ready || !dirty || !patient || !user || status === "FINAL") return;
    {
      const snapshot: DraftSnapshot = {
        input,
        template,
        patient,
        clientId: clientId.current,
        version,
        encounterId,
      };
      draftWrites.current = draftWrites.current
        .catch(() => {})
        .then(() => saveClinicalDraft(user.id, slot, snapshot));
      void draftWrites.current
        .then(() =>
          setLocalStatus("Borrador cifrado guardado en este dispositivo"),
        )
        .catch(() =>
          setLocalStatus(
            "No se pudo guardar el borrador local. Mantené esta pantalla abierta y guardá en Nexus.",
          ),
        );
    }
  }, [
    input,
    template,
    patient,
    user,
    slot,
    ready,
    dirty,
    status,
    version,
    encounterId,
  ]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stopListening();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stopListening();
    };
  }, [stopListening]);
  const change = useCallback((next: EncounterInput) => {
    setInput(next);
    setDirty(true);
    setServerStatus("Cambios pendientes de guardar en Nexus");
  }, []);
  async function save(): Promise<ClinicalEncounter | null> {
    if (!user) return null;
    stopListening();
    setBusy(true);
    setError(null);
    try {
      const body = encounterId
        ? { ...input, version }
        : { ...input, clientId: clientId.current };
      let { encounter } = encounterId
        ? await api.put<{ encounter: ClinicalEncounter }>(
            `/clinical/encounters/${encounterId}`,
            body,
          )
        : await api.post<{ encounter: ClinicalEncounter }>(
            `/clinical/patients/${patientId}/encounters`,
            body,
          );
      // A previous create may have succeeded even if its response was lost.
      // Keep the same client ID, then save subsequent local edits optimistically.
      if (
        !encounterId &&
        JSON.stringify([
          encounter.fields,
          encounter.dictation,
          encounter.occurredAt,
        ]) !== JSON.stringify([input.fields, input.dictation, input.occurredAt])
      ) {
        if (encounter.version !== version)
          throw new Error(
            "La consulta recuperada tiene otra versión. Conservá el borrador y revisá el historial del paciente.",
          );
        const updated = await api.put<{ encounter: ClinicalEncounter }>(
          `/clinical/encounters/${encounter.id}`,
          { ...input, version },
        );
        encounter = updated.encounter;
      }
      await draftWrites.current.catch(() => {});
      try {
        await removeClinicalDraft(user.id, slot);
      } catch {
        setLocalStatus(
          "Guardado en Nexus; no se pudo limpiar la copia local del borrador.",
        );
      }
      setVersion(encounter.version);
      setDirty(false);
      setRecovered(false);
      setServerStatus("Guardado en Nexus");
      if (!encounterId)
        router.replace(`/patients/${patientId}/consultations/${encounter.id}`);
      return encounter;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar. El texto permanece en pantalla.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function finalize() {
    if (!encounterId) return;
    if (input.dictation.trim()) {
      setConfirming(false);
      setError(
        "Hay una transcripción pendiente de revisar. Incorporala a un campo o vaciala explícitamente antes de validar la consulta.",
      );
      return;
    }
    setConfirming(false);
    const saved = dirty ? await save() : null;
    if (dirty && !saved) return;
    setBusy(true);
    setError(null);
    try {
      const { encounter } = await api.post<{ encounter: ClinicalEncounter }>(
        `/clinical/encounters/${encounterId}/finalize`,
        { version: saved?.version ?? version, confirmed: true },
      );
      setStatus("FINAL");
      setVersion(encounter.version);
      setDirty(false);
      setServerStatus(
        "Consulta validada. Para corregirla, registrá una nueva evolución.",
      );
      if (user) await removeClinicalDraft(user.id, slot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo validar");
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <div className="flex flex-col gap-4">
        <ClinicalHeader title="Consulta" />
        <ClinicalError message={error} />
        {!error && <p>Cargando…</p>}
      </div>
    );
  const readonly = status === "FINAL" || busy;
  const birth = patient?.birthDate
    ? new Date(`${patient.birthDate}T00:00:00`)
    : null;
  const now = new Date();
  const age =
    birth && Number.isFinite(birth.getTime()) && birth <= now
      ? now.getFullYear() -
        birth.getFullYear() -
        Number(
          now.getMonth() < birth.getMonth() ||
            (now.getMonth() === birth.getMonth() &&
              now.getDate() < birth.getDate()),
        )
      : null;
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title={encounterId ? template.name : "Nueva consulta"}
        detail={patient?.name}
      />
      <div className="sticky top-0 z-20 rounded-xl border border-nexus-border bg-nexus-bg/95 p-3 text-sm">
        <Link
          className="font-semibold text-nexus-cyan"
          href={`/patients/${patientId}`}
        >
          {patient?.name}
        </Link>{" "}
        · {patient?.document || "Documento no registrado"}
        {age !== null && ` · ${age} años`}
        <p className="mt-1 text-xs text-nexus-muted">
          {status === "FINAL" ? "Validada" : "Borrador"} ·{" "}
          {serverStatus || "Todavía no guardado en Nexus"}
        </p>
        <details className="mt-2 rounded-lg border border-nexus-border p-2">
          <summary className="cursor-pointer font-medium">
            Contexto de la ficha · alergias, medicación y antecedentes
          </summary>
          <dl className="mt-3 flex max-h-[45vh] flex-col gap-3 overflow-y-auto text-sm">
            {(
              [
                ["Alergias", patient?.allergies],
                ["Medicación habitual", patient?.medication],
                ["Antecedentes", patient?.history],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="font-semibold">{label}</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {value || "No registrado"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-nexus-muted">
            Información actual de la ficha. Revisala en esta atención; no se
            incorpora automáticamente a la consulta.
          </p>
        </details>
      </div>
      <ClinicalError message={error} />
      {recovered && (
        <p
          role="status"
          className="rounded-xl border border-nexus-amber/40 p-3 text-sm text-nexus-amber"
        >
          Recuperé un borrador local. Revisalo antes de guardarlo.
        </p>
      )}
      <section className="glass-panel flex flex-col gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Plantilla
            <select
              disabled={!!encounterId || readonly}
              className={`${clinicalInput} mt-2`}
              value={input.templateId}
              onChange={(e) => {
                const next = templates.find((t) => t.id === e.target.value);
                if (!next) return;
                if (
                  (Object.values(input.fields).some(Boolean) ||
                    !!input.dictation.trim()) &&
                  !window.confirm(
                    "Cambiar la plantilla borrará sus campos actuales. ¿Continuar?",
                  )
                )
                  return;
                setTemplate(next);
                setTarget("");
                change({ ...input, templateId: next.id, fields: {} });
              }}
            >
              {(!templates.some((t) => t.id === template.id)
                ? [template, ...templates]
                : templates
              ).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Fecha y hora de atención
            <input
              disabled={readonly}
              type="datetime-local"
              className={`${clinicalInput} mt-2`}
              value={new Date(
                Date.parse(input.occurredAt) -
                  new Date(input.occurredAt).getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)}
              onChange={(e) => {
                if (e.target.value)
                  change({
                    ...input,
                    occurredAt: new Date(e.target.value).toISOString(),
                  });
              }}
            />
          </label>
        </div>
        <p className="text-xs text-nexus-muted">
          Completá solo lo evaluado. Los campos vacíos se mostrarán como “No
          registrado”.
        </p>
        {template.fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-2 text-sm">
            {field.label}
            <textarea
              disabled={readonly}
              rows={3}
              maxLength={10000}
              className={clinicalInput}
              value={input.fields[field.key] || ""}
              onChange={(e) =>
                change({
                  ...input,
                  fields: { ...input.fields, [field.key]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </section>
      {status !== "FINAL" && (
        <section className="glass-panel flex flex-col gap-3 p-4">
          <h2 className="font-semibold">Dictado clínico</h2>
          <p className="text-xs leading-relaxed text-nexus-muted">
            El dictado se incorpora al borrador, sin enviarlo al asistente de IA
            de Nexus. El reconocimiento del navegador puede procesar audio en un
            servicio externo. Activá el micrófono solo en un entorno adecuado;
            también podés escribir.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy || !sttSupported}
              className={clinicalSecondary}
              onClick={() => {
                if (listening) {
                  stopListening();
                  return;
                }
                startListening((text) => {
                  setInput((prev) => ({
                    ...prev,
                    dictation:
                      `${prev.dictation}${prev.dictation ? "\n" : ""}${text}`.slice(
                        0,
                        40000,
                      ),
                  }));
                  setDirty(true);
                });
              }}
            >
              {listening ? "Detener dictado" : "Dictar un fragmento"}
            </button>
            <p className="self-center text-sm text-nexus-muted">
              {listening
                ? "Escuchando…"
                : !sttSupported
                  ? "Usá el dictado del teclado del teléfono"
                  : "Micrófono apagado"}
            </p>
          </div>
          {interimTranscript && (
            <p className="text-sm text-nexus-cyan">{interimTranscript}</p>
          )}
          <ClinicalError message={speechError} />
          <label className="text-sm">
            Transcripción para revisar
            <textarea
              disabled={busy}
              rows={5}
              maxLength={40000}
              className={`${clinicalInput} mt-2`}
              value={input.dictation}
              onChange={(e) => change({ ...input, dictation: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              aria-label="Campo destinatario del dictado"
              className={clinicalInput}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Elegir campo…</option>
              {template.fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              className={`${clinicalSecondary} shrink-0`}
              disabled={
                !template.fields.some((f) => f.key === target) ||
                !input.dictation.trim() ||
                busy
              }
              onClick={() => {
                if (!template.fields.some((f) => f.key === target)) return;
                const combined = `${input.fields[target] || ""}${input.fields[target] ? "\n" : ""}${input.dictation}`;
                if (combined.length > 10000) {
                  setError(
                    "El campo supera 10.000 caracteres. Dividí el texto antes de incorporarlo.",
                  );
                  return;
                }
                change({
                  ...input,
                  dictation: "",
                  fields: { ...input.fields, [target]: combined },
                });
              }}
            >
              Incorporar al campo
            </button>
          </div>
        </section>
      )}
      <p
        role="status"
        className={`text-xs ${localStatus.startsWith("No se pudo") ? "text-nexus-amber" : "text-nexus-muted"}`}
      >
        {localStatus}
      </p>
      <div className="flex flex-wrap gap-3">
        {status !== "FINAL" && (
          <button
            disabled={busy}
            className={clinicalButton}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar borrador en Nexus"}
          </button>
        )}
        {encounterId && status !== "FINAL" && (
          <button
            disabled={busy}
            className={clinicalSecondary}
            onClick={() => setConfirming(true)}
          >
            Revisar y validar
          </button>
        )}
        {encounterId && (
          <Link
            className={clinicalSecondary}
            href={`/patients/${patientId}/consultations/${encounterId}/document`}
          >
            Ver documento guardado
          </Link>
        )}
        {status === "FINAL" && (
          <Link
            className={clinicalButton}
            href={`/patients/${patientId}/consultations/new`}
          >
            Agregar nueva evolución
          </Link>
        )}
      </div>
      {confirming && (
        <dialog
          ref={validationDialog}
          onCancel={() => setConfirming(false)}
          aria-label="Validar consulta"
          className="glass-panel m-auto flex w-11/12 max-w-lg flex-col gap-3 p-5 text-nexus-text backdrop:bg-black/70"
        >
          <h2 className="font-semibold">¿Validar esta consulta?</h2>
          <p className="text-sm">
            Confirmás que revisaste el contenido y el paciente. Esta versión
            quedará bloqueada para edición; las correcciones se registran como
            nuevas evoluciones. No constituye una firma digital.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              autoFocus
              className={clinicalSecondary}
              onClick={() => setConfirming(false)}
            >
              Volver a revisar
            </button>
            <button className={clinicalButton} onClick={() => void finalize()}>
              Confirmar validación
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
