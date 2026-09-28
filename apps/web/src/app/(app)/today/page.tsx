"use client";

import type { Event, Task } from "@nexus/shared";
import { NexusFace, type FaceState } from "@/components/NexusFace";
import { useAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/useApiData";
import { useSpeech } from "@/lib/useSpeech";

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

/** Staggered entrance so panels feel like they "deploy" around the Face
 * instead of just appearing (spec: layout tipo JARVIS). */
function deployStyle(index: number): React.CSSProperties {
  return { animationDelay: `${index * 60}ms` };
}

function buildSpokenSummary(data: TodayResponse): string {
  const parts: string[] = [];
  parts.push(
    data.now
      ? `Lo próximo es "${data.now.title}" a las ${formatTime(data.now.startAt)}.`
      : "No tenés nada agendado próximamente."
  );
  if (data.priorities.length > 0) {
    parts.push(`Tus prioridades: ${data.priorities.map((t) => t.title).join(", ")}.`);
  }
  if (data.attention.length > 0) {
    parts.push(`Atención: ${data.attention.join(". ")}.`);
  }
  if (data.insight) parts.push(data.insight);
  return parts.join(" ");
}

export default function TodayPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApiData<TodayResponse>("/today");
  const { speak, speaking, ttsSupported } = useSpeech();

  const faceState: FaceState = speaking ? "speaking" : data && data.attention.length > 0 ? "action-required" : "idle";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-3 py-2 text-center sm:flex-row sm:justify-center sm:text-left">
        <NexusFace state={faceState} size={72} />
        <div>
          <h1 className="text-2xl font-semibold">
            {greeting()}
            {user ? `, ${user.name.split(" ")[0]}` : ""}.
          </h1>
          {data?.now && (
            <p className="text-sm text-nexus-muted">
              Próximo: <span className="text-nexus-cyan">{formatTime(data.now.startAt)}</span> — {data.now.title}
            </p>
          )}
        </div>
        {ttsSupported && data && (
          <button
            onClick={() => void speak(buildSpokenSummary(data))}
            disabled={speaking}
            className="ml-0 flex items-center gap-1.5 rounded-full border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted disabled:opacity-50 sm:ml-auto"
          >
            {speaking ? "🔊 Hablando…" : "🔊 Escuchar resumen"}
          </button>
        )}
      </header>

      {loading && <p className="text-center text-nexus-muted">Cargando…</p>}
      {error && <p className="text-center text-nexus-danger">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section className="glass-panel animate-panel-deploy p-4" style={deployStyle(0)}>
            <h2 className="mb-1 text-xs font-medium tracking-widest text-nexus-muted">NOW</h2>
            {data.now ? (
              <p className="text-lg">
                <span className="text-nexus-cyan">{formatTime(data.now.startAt)}</span> — {data.now.title}
              </p>
            ) : (
              <p className="text-nexus-muted">No tenés nada agendado próximamente.</p>
            )}
          </section>

          <section className="glass-panel animate-panel-deploy p-4" style={deployStyle(1)}>
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

          <section className="glass-panel animate-panel-deploy p-4 sm:col-span-2" style={deployStyle(2)}>
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
            <section
              className="glass-panel animate-panel-deploy border-nexus-amber/30 p-4"
              style={deployStyle(3)}
            >
              <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-amber">ATTENTION</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {data.attention.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {data.insight && (
            <section
              className="glass-panel animate-panel-deploy border-nexus-violet/30 p-4"
              style={deployStyle(4)}
            >
              <h2 className="mb-1 text-xs font-medium tracking-widest text-nexus-violet">NEXUS INSIGHT</h2>
              <p className="text-sm">{data.insight}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
