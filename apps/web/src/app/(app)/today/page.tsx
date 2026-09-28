"use client";

import type { Event, Task } from "@nexus/shared";
import { useAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/useApiData";

interface TodayResponse {
  now: Event | null;
  priorities: Task[];
  timeline: Event[];
  attention: string[];
  insight: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default function TodayPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApiData<TodayResponse>("/today");

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">
          {greeting()}
          {user ? `, ${user.name.split(" ")[0]}` : ""}.
        </h1>
      </header>

      {loading && <p className="text-nexus-muted">Cargando…</p>}
      {error && <p className="text-nexus-danger">{error}</p>}

      {data && (
        <>
          <section className="glass-panel p-4">
            <h2 className="mb-1 text-xs font-medium tracking-widest text-nexus-muted">NOW</h2>
            {data.now ? (
              <p className="text-lg">
                <span className="text-nexus-cyan">{formatTime(data.now.startAt)}</span> — {data.now.title}
              </p>
            ) : (
              <p className="text-nexus-muted">No tenés nada agendado próximamente.</p>
            )}
          </section>

          <section className="glass-panel p-4">
            <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">PRIORIDADES</h2>
            {data.priorities.length === 0 ? (
              <p className="text-nexus-muted">Sin prioridades pendientes.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.priorities.map((task) => (
                  <li key={task.id} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-nexus-cyan" />
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-panel p-4">
            <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">TIMELINE</h2>
            {data.timeline.length === 0 ? (
              <p className="text-nexus-muted">Sin eventos para hoy.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.timeline.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-nexus-muted">{formatTime(event.startAt)}</span>
                    {event.title}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.attention.length > 0 && (
            <section className="glass-panel border-nexus-amber/30 p-4">
              <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-amber">ATTENTION</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {data.attention.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {data.insight && (
            <section className="glass-panel border-nexus-violet/30 p-4">
              <h2 className="mb-1 text-xs font-medium tracking-widest text-nexus-violet">NEXUS INSIGHT</h2>
              <p className="text-sm">{data.insight}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
