"use client";

import type { Project } from "@nexus/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectComposer } from "@/components/ProjectComposer";
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
  const { data, loading, error } = useApiData<{ projects: Project[] }>(
    "/projects",
  );
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Proyectos</h1>
      </header>

      <ProjectComposer
        onCreated={(project) => router.push(`/projects/${project.id}`)}
      />

      {loading && <p className="text-nexus-muted">Cargando…</p>}
      {error && <p className="text-nexus-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data?.projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="glass-panel flex flex-col gap-2 p-4 transition-colors hover:border-nexus-cyan/40"
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h2 className="min-w-0 break-words font-medium">
                {project.name}
              </h2>
              <span className="shrink-0 rounded-full border border-nexus-border px-2 py-0.5 text-xs text-nexus-muted">
                {STATUS_LABEL[project.status]}
              </span>
            </div>
            {project.goal && (
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-nexus-muted">
                {project.goal}
              </p>
            )}
            <p className="text-xs text-nexus-muted">
              {project.progress}% de tareas completadas
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-nexus-cyan"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
