"use client";

import type { Memory } from "@nexus/shared";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

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
    </div>
  );
}
