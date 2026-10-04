"use client";

import type { Area } from "@nexus/shared";
import { DEFAULT_AREAS } from "@nexus/shared";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

export default function AreasPage() {
  const { data, loading, error, reload } = useApiData<{ areas: Area[] }>("/areas");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createArea(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    await api.post("/areas", { name: name.trim() });
    setName("");
    await reload();
    setSubmitting(false);
  }

  async function seedDefaults() {
    setSubmitting(true);
    for (const area of DEFAULT_AREAS) {
      await api.post("/areas", area);
    }
    await reload();
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Áreas</h1>
        <p className="text-sm text-nexus-muted">Las categorías centrales de tu vida. Creá las que quieras.</p>
      </header>

      <form onSubmit={createArea} className="glass-panel flex gap-2 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva área…"
          aria-label="Nombre de la nueva área"
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

      {data && data.areas.length === 0 && (
        <button
          onClick={() => void seedDefaults()}
          disabled={submitting}
          className="glass-panel p-4 text-left text-sm text-nexus-cyan disabled:opacity-40"
        >
          Usar áreas sugeridas (Trabajo, Consultorio, Videojuegos, Finanzas…)
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data?.areas.map((area) => (
          <div key={area.id} className="glass-panel flex items-center gap-2 p-4">
            {area.icon && <span className="text-lg">{area.icon}</span>}
            <span className="text-sm">{area.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
