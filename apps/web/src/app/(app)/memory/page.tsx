"use client";

import type { Memory } from "@nexus/shared";
import type { Habit } from "@nexus/verticals";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

/** El "cerebro" clínico: cuadro → conducta habitual, visible y borrable. */
function ClinicalHabits() {
  const { data, loading, error, reload } = useApiData<{ habits: Habit[] }>("/verticals/medicine/habits");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function forget(key: string) {
    setBusyKey(key);
    setActionError(null);
    try {
      await api.delete(`/verticals/medicine/habits/${encodeURIComponent(key)}`);
      await reload();
    } catch {
      setActionError("No pude borrarlo. Probá de nuevo.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="glass-panel flex flex-col gap-3 p-4" aria-labelledby="habits-title">
      <div>
        <h2 id="habits-title" className="text-lg font-semibold">Lo que Nexus aprendió de vos</h2>
        <p className="mt-1 text-sm text-nexus-muted">
          Nexus aprende de las consultas que validás o confirmás: para cada cuadro, qué conducta solés indicar. Lo usa
          para mostrarte «Tu conducta habitual» mientras cargás una consulta. Nunca guarda el nombre, el documento ni
          otros datos que identifiquen al paciente. Podés borrar lo que no quieras que recuerde.
        </p>
      </div>
      {loading && !data && <p className="text-sm text-nexus-muted">Cargando…</p>}
      {error && <p className="text-sm text-nexus-danger">No pude cargar lo aprendido.</p>}
      {actionError && <p role="alert" className="text-sm text-nexus-danger">{actionError}</p>}
      {data && data.habits.length === 0 && (
        <p className="text-sm text-nexus-muted">
          Todavía no aprendió nada. Validá una consulta con diagnóstico y tratamiento y va a aparecer acá.
        </p>
      )}
      {data && data.habits.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.habits.map((habit) => (
            <li key={habit.key} className="flex items-start justify-between gap-3 rounded-xl border border-nexus-border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{habit.label}</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {habit.treatments.slice(0, 3).map((t) => (
                    <li key={t.text} className="break-words">
                      {t.text}{" "}
                      <span className="text-xs text-nexus-muted">
                        · {t.count} {t.count === 1 ? "vez" : "veces"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => void forget(habit.key)}
                disabled={busyKey === habit.key}
                aria-label={`Olvidar ${habit.label}`}
                className="shrink-0 text-xs text-nexus-danger disabled:opacity-50"
              >
                {busyKey === habit.key ? "Borrando…" : "Olvidar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MemoryPage() {
  const { data, loading, error, reload } = useApiData<{ memories: Memory[] }>("/memories");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.memories;
    return data.memories.filter((m) => m.content.toLowerCase().includes(q));
  }, [data, query]);

  async function createMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    await api.post("/memories", { content: content.trim() });
    setContent("");
    await reload();
    setSubmitting(false);
  }

  async function saveEdit(id: string) {
    if (!editingText.trim()) return;
    await api.patch(`/memories/${id}`, { content: editingText.trim() });
    setEditingId(null);
    await reload();
  }

  async function removeMemory(id: string) {
    await api.delete(`/memories/${id}`);
    await reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Memoria</h1>
        <p className="text-sm text-nexus-muted">
          Lo que le pediste a NEXUS que recuerde. Nunca es una caja negra — lo ves, lo editás y lo borrás vos.
          También podés decirle "recordá que…" por voz.
        </p>
      </header>

      <form onSubmit={createMemory} className="glass-panel flex gap-2 p-4">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Ej: mi hijo se llama Tomás…"
          className="flex-1 rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-nexus-cyan px-4 py-2 text-sm font-medium text-nexus-bg disabled:opacity-40"
        >
          Recordar
        </button>
      </form>

      {data && data.memories.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en tu memoria…"
          className="rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none"
        />
      )}

      {loading && <p className="text-nexus-muted">Cargando…</p>}
      {error && <p className="text-nexus-danger">{error}</p>}
      {data && data.memories.length === 0 && (
        <p className="glass-panel p-4 text-sm text-nexus-muted">
          Todavía no le pediste a NEXUS que recuerde nada. Decile "recordá que…" o escribilo acá arriba.
        </p>
      )}
      {data && data.memories.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-nexus-muted">Nada coincide con "{query}".</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((memory) => (
          <div key={memory.id} className="glass-panel flex items-start justify-between gap-3 p-4">
            {editingId === memory.id ? (
              <div className="flex flex-1 gap-2">
                <input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  autoFocus
                  className="flex-1 rounded-lg border border-nexus-border bg-black/30 px-2 py-1 text-sm focus:border-nexus-cyan focus:outline-none"
                />
                <button onClick={() => void saveEdit(memory.id)} className="text-sm text-nexus-cyan">
                  Guardar
                </button>
                <button onClick={() => setEditingId(null)} className="text-sm text-nexus-muted">
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <p className="flex-1 text-sm">{memory.content}</p>
                <div className="flex shrink-0 gap-3">
                  <button
                    onClick={() => {
                      setEditingId(memory.id);
                      setEditingText(memory.content);
                    }}
                    className="text-xs text-nexus-muted hover:text-nexus-text"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void removeMemory(memory.id)}
                    className="text-xs text-nexus-danger"
                  >
                    Borrar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <ClinicalHabits />
    </div>
  );
}
