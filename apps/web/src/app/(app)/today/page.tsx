"use client";

import type { Event, Task } from "@nexus/shared";
import type { FaceState } from "@/components/NexusFace";
import { NexusCore } from "@/components/NexusCore";
import { UiIcon } from "@/components/UiIcon";
import Link from "next/link";
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
      <header className="glass-panel nexus-command-center flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="hud-label mb-3 text-nexus-cyan">Tu día, en foco</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}{user ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-nexus-muted">{data?.now ? `Próximo: ${formatTime(data.now.startAt)} · ${data.now.title}` : "Un espacio para ordenar tus ideas y avanzar con lo que importa."}</p>
          </div>
          <NexusCore state={faceState} size={80}/>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/today?listen=1" className="nexus-voice-launch flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-nexus-cyan"><UiIcon name="voice"/>Hablar con Nexus</Link>
          {ttsSupported && data && <button onClick={() => void speak(buildSpokenSummary(data))} disabled={speaking} className="rounded-xl border border-nexus-border px-4 py-2.5 text-sm text-nexus-muted disabled:opacity-50">{speaking ? "Leyendo resumen…" : "Escuchar resumen"}</button>}
        </div>
        {data && <div className="nexus-metrics grid grid-cols-3 border-t border-nexus-border pt-4">
          {[[data.priorities.length,"Prioridades"],[data.timeline.length,"Eventos hoy"],[data.attention.length,"Avisos"]].map(([value,label])=><div key={label} className="min-w-0"><p className="font-mono text-2xl tabular-nums text-nexus-cyan">{value}</p><p className="mt-1 text-[11px] text-nexus-muted">{label}</p></div>)}
        </div>}
      </header>

      <section aria-label="Consultorio" className="glass-panel flex flex-col gap-3 p-4">
        <h2 className="text-xs font-medium tracking-widest text-nexus-cyan">CONSULTORIO</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/patients" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-nexus-cyan px-4 py-3 text-base font-medium text-nexus-bg"><UiIcon name="patients"/>Pacientes</Link>
          <Link href="/patients/capture" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-nexus-cyan/50 px-4 py-3 text-base text-nexus-cyan"><UiIcon name="voice"/>Dictar paciente</Link>
          <Link href="/patients/day" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-nexus-cyan/50 px-4 py-3 text-base text-nexus-cyan"><UiIcon name="today"/>Mi día médico</Link>
        </div>
      </section>

      {loading && <p className="text-center text-nexus-muted">Cargando…</p>}
      {error && <p className="text-center text-nexus-danger">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section className="glass-panel animate-panel-deploy p-4" style={deployStyle(0)}>
            <h2 className="mb-1 text-xs font-medium tracking-widest text-nexus-muted">PRÓXIMO EVENTO</h2>
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
                  <li key={task.id} className="flex items-center gap-2 rounded-lg bg-white/[0.025] px-3 py-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-nexus-cyan" />
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-panel animate-panel-deploy p-4 sm:col-span-2" style={deployStyle(2)}>
            <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">AGENDA DE HOY</h2>
            {data.timeline.length === 0 ? (
              <p className="text-nexus-muted">Sin eventos para hoy.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.timeline.map((event) => (
                  <li key={event.id} className="nexus-timeline-row flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
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
              <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-amber">REQUIERE ATENCIÓN</h2>
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
              <h2 className="mb-1 text-xs font-medium tracking-widest text-nexus-violet">PERSPECTIVA NEXUS</h2>
              <p className="text-sm">{data.insight}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
