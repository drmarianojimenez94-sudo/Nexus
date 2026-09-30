"use client";
import { useEffect, useState } from "react";
import type { Project, ProjectDraft } from "@nexus/shared";
import { api } from "@/lib/api";
import { useSpeech } from "@/lib/useSpeech";
const field =
  "w-full min-w-0 rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none";
export function ProjectComposer({
  onCreated,
}: {
  onCreated: (project: Project) => void;
}) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ProjectDraft>({
    name: "",
    goal: "",
    tasks: [],
  });
  const [pendingText, setPendingText] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const speech = useSpeech();
  useEffect(() => {
    try {
      const incoming = sessionStorage.getItem("nexus_project_brief");
      if (incoming) {
        setText(incoming.slice(0, 10000));
        sessionStorage.removeItem("nexus_project_brief");
      }
    } catch {
      /* The form remains usable when browser storage is disabled. */
    }
  }, []);
  function editDraft(next: ProjectDraft) {
    setDraft(next);
    setClientId(null);
  }
  async function organize() {
    setBusy(true);
    setError("");
    speech.stopListening();
    try {
      const result = await api.post<{ draft: ProjectDraft; notice: string }>(
        "/projects/plan",
        { text, useAI },
      );
      editDraft(result.draft);
      setPendingText(result.draft.tasks.join("\n"));
      setNotice(result.notice);
    } catch {
      setError("No se pudo organizar. Podés completar los campos manualmente.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    speech.stopListening();
    const tasks = pendingText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (tasks.length > 100 || tasks.some((task) => task.length > 300)) {
      setError("Usá hasta 100 pendientes, de hasta 300 caracteres cada uno.");
      setBusy(false);
      return;
    }
    const token = clientId ?? crypto.randomUUID();
    setClientId(token);
    try {
      const { project } = await api.post<{ project: Project }>("/projects", {
        ...draft,
        tasks,
        clientId: token,
      });
      onCreated(project);
    } catch {
      setError(
        "No se pudo confirmar el guardado. Reintentá sin cambiar los campos para evitar duplicados.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass-panel space-y-4 p-4">
      <h2 className="font-medium">Explicá tu proyecto</h2>
      <p className="text-sm text-nexus-muted">
        Escribí o dictá en qué consiste y qué queda por hacer. Revisá el
        borrador antes de guardar.
      </p>
      <label className="block text-sm">
        Tu explicación
        <textarea
          className={`${field} mt-1`}
          rows={4}
          maxLength={10000}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="Proyecto: Consultorio. Descripción: organizar la atención. Pendientes: elegir lugar; preparar agenda; comprar equipo."
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-nexus-border px-3 py-2 text-sm"
          onClick={() =>
            speech.listening
              ? speech.stopListening()
              : speech.startListening((fragment) =>
                  setText((current) =>
                    `${current} ${fragment}`.trim().slice(0, 10000),
                  ),
                )
          }
        >
          {speech.listening ? "Detener dictado" : "Dictar explicación"}
        </button>
        <button
          type="button"
          onClick={() => void organize()}
          disabled={busy || !text.trim() || speech.listening}
          className="rounded-lg border border-nexus-cyan px-3 py-2 text-sm"
        >
          Organizar borrador
        </button>
      </div>
      {speech.interimTranscript && (
        <p className="text-sm text-nexus-muted">{speech.interimTranscript}</p>
      )}
      {speech.error && (
        <p role="alert" className="text-sm text-nexus-danger">
          {speech.error}
        </p>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={useAI}
          disabled={busy}
          onChange={(e) => setUseAI(e.target.checked)}
        />
        Organizar con IA (envía esta explicación al proveedor configurado)
      </label>
      <p className="text-xs text-nexus-muted">
        Sin IA, usá «Proyecto», «Descripción» y «Pendientes»; separá pendientes
        con punto y coma o una línea por tarea. Usá esta sección para proyectos
        personales, sin datos de pacientes. La voz puede usar servicios del
        navegador.
      </p>
      {notice && (
        <p role="status" className="text-sm text-nexus-muted">
          {notice}
        </p>
      )}
      <form
        onSubmit={save}
        className="space-y-3 border-t border-nexus-border pt-4"
      >
        <h3 className="text-sm font-medium">Revisar y guardar</h3>
        <label className="block text-sm">
          Nombre del proyecto
          <input
            className={`${field} mt-1`}
            required
            maxLength={120}
            value={draft.name}
            disabled={busy}
            onChange={(e) => editDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Descripción
          <textarea
            className={`${field} mt-1`}
            rows={4}
            maxLength={10000}
            value={draft.goal}
            disabled={busy}
            onChange={(e) => editDraft({ ...draft, goal: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Pendientes (una tarea por línea)
          <textarea
            className={`${field} mt-1`}
            rows={4}
            value={pendingText}
            disabled={busy}
            onChange={(e) => {
              setPendingText(e.target.value);
              setClientId(null);
            }}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-nexus-danger">
            {error}
          </p>
        )}
        <button
          disabled={busy || speech.listening || !draft.name.trim()}
          className="rounded-lg bg-nexus-cyan px-4 py-2 text-sm font-medium text-nexus-bg disabled:opacity-40"
        >
          {busy ? "Procesando…" : "Guardar proyecto y pendientes"}
        </button>
      </form>
    </section>
  );
}
