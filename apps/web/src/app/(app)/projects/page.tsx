"use client";

import type { Project } from "@nexus/shared";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

const STATUS_LABEL: Record<Project["status"], string> = {
  IDEA: "Idea",
  PLANNED: "Planificado",
  ACTIVE: "Activo",
  WAITING: "En espera",
  COMPLETED: "Completado",
  ARCHIVED: "Archivado",
};

export default function ProjectsPage() {
  const { data, loading, error, reload } = useApiData<{ projects: Project[] }>("/projects");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await api.post("/projects", { name: name.trim() });
    setName("");
    await reload();
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Projects</h1>
      </header>

      <form onSubmit={createProject} className="glass-panel flex gap-2 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuevo proyecto…"
          className="flex-1 rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-nexus-cyan px-4 py-2 text-sm font-medium text-nexus-bg disabled:opacity-40"
        >
          Crear
        </button>
      </form>

      {loading && <p className="text-nexus-muted">Cargando…</p>}
      {error && <p className="text-nexus-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data?.projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="glass-panel flex flex-col gap-2 p-4 transition-colors hover:border-nexus-cyan/40"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{project.name}</h2>
              <span className="rounded-full border border-nexus-border px-2 py-0.5 text-xs text-nexus-muted">
                {STATUS_LABEL[project.status]}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-nexus-cyan" style={{ width: `${project.progress}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
