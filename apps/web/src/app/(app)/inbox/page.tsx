"use client";

import type { InboxItem } from "@nexus/shared";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

export default function InboxPage() {
  const { data, loading, error, reload } = useApiData<{ items: InboxItem[] }>("/inbox");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function dismiss(id: string) {
    setBusyId(id);
    await api.post(`/inbox/${id}/dismiss`);
    await reload();
    setBusyId(null);
  }

  async function convertToTask(item: InboxItem) {
    setBusyId(item.id);
    await api.post("/tasks", { title: item.rawText.slice(0, 300) });
    await api.post(`/inbox/${item.id}/dismiss`);
    await reload();
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-nexus-muted">Todo lo que capturaste sin clasificar todavía.</p>
      </header>

      {loading && <p className="text-nexus-muted">Cargando…</p>}
      {error && <p className="text-nexus-danger">{error}</p>}

      {data && data.items.length === 0 && <p className="text-nexus-muted">Tu inbox está vacío. Buen trabajo.</p>}

      <ul className="flex flex-col gap-2">
        {data?.items.map((item) => (
          <li key={item.id} className="glass-panel flex items-start justify-between gap-3 p-4">
            <p className="text-sm">{item.rawText}</p>
            <div className="flex shrink-0 gap-2">
              <button
                disabled={busyId === item.id}
                onClick={() => void convertToTask(item)}
                className="rounded-full border border-nexus-border px-3 py-1 text-xs text-nexus-cyan disabled:opacity-40"
              >
                → Tarea
              </button>
              <button
                disabled={busyId === item.id}
                onClick={() => void dismiss(item.id)}
                className="rounded-full border border-nexus-border px-3 py-1 text-xs text-nexus-muted disabled:opacity-40"
              >
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
