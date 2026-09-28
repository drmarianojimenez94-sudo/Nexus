"use client";

import type { Milestone, Project, Task } from "@nexus/shared";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

type ProjectDetail = Project & { milestones: Milestone[]; tasks: Task[] };

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApiData<{ project: ProjectDetail }>(`/projects/${id}`);
  const [taskTitle, setTaskTitle] = useState("");

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await api.post("/tasks", { title: taskTitle.trim(), projectId: id });
    setTaskTitle("");
    await reload();
  }

  async function toggleTask(task: Task) {
    await api.patch(`/tasks/${task.id}`, { status: task.status === "DONE" ? "TODO" : "DONE" });
    await reload();
  }

  if (loading) return <p className="text-nexus-muted">Cargando…</p>;
  if (error || !data) return <p className="text-nexus-danger">No se pudo cargar el proyecto.</p>;

  const { project } = data;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        {project.goal && <p className="mt-1 text-sm text-nexus-muted">{project.goal}</p>}
      </header>

      <section className="glass-panel p-4">
        <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">TAREAS</h2>
        <form onSubmit={addTask} className="mb-3 flex gap-2">
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Nueva tarea…"
            className="flex-1 rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-nexus-cyan px-4 py-2 text-sm font-medium text-nexus-bg">
            +
          </button>
        </form>
        <ul className="flex flex-col gap-1">
          {project.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={task.status === "DONE"}
                onChange={() => void toggleTask(task)}
                className="h-4 w-4 accent-nexus-cyan"
              />
              <span className={task.status === "DONE" ? "text-nexus-muted line-through" : ""}>{task.title}</span>
            </li>
          ))}
          {project.tasks.length === 0 && <p className="text-sm text-nexus-muted">Sin tareas todavía.</p>}
        </ul>
      </section>

      {project.milestones.length > 0 && (
        <section className="glass-panel p-4">
          <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">HITOS</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {project.milestones.map((m) => (
              <li key={m.id} className={m.completedAt ? "text-nexus-muted line-through" : ""}>
                {m.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
