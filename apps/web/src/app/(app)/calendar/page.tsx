"use client";

import type { Event } from "@nexus/shared";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

function groupByDay(events: Event[]) {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const key = new Date(event.startAt).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return groups;
}

export default function CalendarPage() {
  const { data, loading, error, reload } = useApiData<{ events: Event[] }>("/events");
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startAt) return;
    setSubmitting(true);
    await api.post("/events", { title: title.trim(), startAt: new Date(startAt).toISOString() });
    setTitle("");
    setStartAt("");
    await reload();
    setSubmitting(false);
  }

  const groups = data ? groupByDay(data.events) : new Map<string, Event[]>();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Calendar</h1>
      </header>

      <form onSubmit={addEvent} className="glass-panel flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-nexus-muted">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reunión con Pedro"
            className="w-full rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-nexus-muted">Fecha y hora</label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="rounded-lg border border-nexus-border bg-black/30 px-3 py-2 text-sm focus:border-nexus-cyan focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-nexus-cyan px-4 py-2 text-sm font-medium text-nexus-bg disabled:opacity-40"
        >
          Agregar
        </button>
      </form>

      {loading && <p className="text-nexus-muted">Cargando…</p>}
      {error && <p className="text-nexus-danger">{error}</p>}
      {data && data.events.length === 0 && <p className="text-nexus-muted">No hay eventos próximos.</p>}

      <div className="flex flex-col gap-4">
        {Array.from(groups.entries()).map(([day, events]) => (
          <section key={day}>
            <h2 className="mb-2 text-xs font-medium capitalize tracking-widest text-nexus-muted">{day}</h2>
            <ul className="flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="glass-panel flex items-center gap-3 p-3 text-sm">
                  <span className="w-14 shrink-0 text-nexus-cyan">
                    {new Date(event.startAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {event.title}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
