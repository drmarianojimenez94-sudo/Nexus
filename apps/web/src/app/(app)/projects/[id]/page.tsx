"use client";

import type { Milestone, Project, Task } from "@nexus/shared";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

type ProjectDetail = Project & { milestones: Milestone[]; tasks: Task[] };
const field =
  "w-full min-w-0 rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ProjectDetailView key={id} id={id} />;
}
function ProjectDetailView({ id }: { id: string }) {
  const { data, loading, error, reload } = useApiData<{
    project: ProjectDetail;
  }>(`/projects/${id}`);
  const [taskTitle, setTaskTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await work();
      await reload();
    } catch {
      setActionError(
        "No se pudo confirmar el cambio. Revisá el proyecto antes de reintentarlo.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data) return <p className="text-nexus-muted">Cargando…</p>;
  if (error || !data)
    return <p className="text-nexus-danger">No se pudo cargar el proyecto.</p>;
  const { project } = data;
  const pending = project.tasks.filter(
    (task) => task.status !== "DONE" && task.status !== "CANCELLED",
  );
  const completed = project.tasks.filter((task) => task.status === "DONE");
  const cancelled = project.tasks.filter((task) => task.status === "CANCELLED");
  const toggleTask = (task: Task) =>
    void action(async () => {
      await api.patch(`/tasks/${task.id}`, {
        status: task.status === "DONE" ? "TODO" : "DONE",
      });
    });
  const renderTask = (task: Task) => (
    <li key={task.id} className="flex min-w-0 items-start gap-2 py-2 text-sm">
      <input
        aria-label={`${task.status === "DONE" ? "Reabrir" : "Completar"} ${task.title}`}
        type="checkbox"
        checked={task.status === "DONE"}
        disabled={busy}
        onChange={() => toggleTask(task)}
        className="mt-1 h-4 w-4 shrink-0 accent-nexus-cyan"
      />
      <span
        className={`break-words ${task.status === "DONE" ? "text-nexus-muted line-through" : ""}`}
      >
        {task.title}
      </span>
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      <Link href="/projects" className="text-sm text-nexus-cyan">
        ← Proyectos
      </Link>
      <header>
        <h1 className="break-words text-2xl font-semibold">{project.name}</h1>
        <p className="mt-2 text-sm text-nexus-muted">
          {completed.length} de {pending.length + completed.length} tareas
          completadas · {project.progress}%
        </p>
      </header>
      {actionError && (
        <p role="alert" className="text-nexus-danger">
          {actionError}
        </p>
      )}
      <section className="glass-panel space-y-3 p-4">
        <h2 className="font-medium">Descripción del proyecto</h2>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await api.patch(`/projects/${id}`, { name: name.trim(), goal });
                setEditing(false);
              });
            }}
          >
            <label className="block text-sm">
              Nombre
              <input
                className={`${field} mt-1`}
                required
                maxLength={120}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Descripción
              <textarea
                className={`${field} mt-1`}
                rows={5}
                maxLength={10000}
                value={goal}
                disabled={busy}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
            <div className="flex gap-3">
              <button
                disabled={busy || !name.trim()}
                className="rounded-lg bg-nexus-cyan px-3 py-2 text-sm text-nexus-bg"
              >
                Guardar cambios
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words text-sm text-nexus-muted">
              {project.goal || "Todavía no agregaste una descripción."}
            </p>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                setName(project.name);
                setGoal(project.goal ?? "");
                setEditing(true);
              }}
              className="text-sm text-nexus-cyan"
            >
              Editar nombre y descripción
            </button>
          </>
        )}
      </section>
      <section className="glass-panel p-4">
        <h2 className="mb-3 font-medium">Pendientes ({pending.length})</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!taskTitle.trim()) return;
            void action(async () => {
              await api.post("/tasks", {
                title: taskTitle.trim(),
                projectId: id,
              });
              setTaskTitle("");
            });
          }}
          className="mb-3 flex gap-2"
        >
          <input
            aria-label="Nuevo pendiente"
            value={taskTitle}
            disabled={busy}
            maxLength={300}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Nueva tarea…"
            className={field}
          />
          <button
            disabled={busy || !taskTitle.trim()}
            className="shrink-0 rounded-lg bg-nexus-cyan px-3 py-2 text-sm text-nexus-bg"
          >
            Agregar
          </button>
        </form>
        <ul>{pending.map(renderTask)}</ul>
        {!pending.length && (
          <p className="text-sm text-nexus-muted">Sin pendientes.</p>
        )}
      </section>
      <section className="glass-panel p-4">
        <h2 className="mb-2 font-medium">Completadas ({completed.length})</h2>
        <ul>{completed.map(renderTask)}</ul>
        {!completed.length && (
          <p className="text-sm text-nexus-muted">
            Todavía no hay tareas completadas.
          </p>
        )}
      </section>
      {cancelled.length > 0 && (
        <section className="glass-panel p-4">
          <h2 className="font-medium">Canceladas</h2>
          <ul>
            {cancelled.map((task) => (
              <li
                key={task.id}
                className="break-words py-2 text-sm text-nexus-muted"
              >
                {task.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      {project.milestones.length > 0 && (
        <section className="glass-panel p-4">
          <h2 className="mb-2 font-medium">Hitos</h2>
          <ul>
            {project.milestones.map((milestone) => (
              <li
                key={milestone.id}
                className={`break-words text-sm ${milestone.completedAt ? "text-nexus-muted line-through" : ""}`}
              >
                {milestone.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
