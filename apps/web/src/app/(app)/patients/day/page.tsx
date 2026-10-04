"use client";
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import type { DayBrief } from "@nexus/verticals";
import { useApiData } from "@/lib/useApiData";
import { useSpeech } from "@/lib/useSpeech";
import { isVoiceMuted } from "@/lib/voice";
import {
  ClinicalHeader,
  ClinicalError,
  clinicalButton,
  clinicalSecondary,
} from "@/components/ClinicalUi";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-panel flex flex-col gap-2 p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
const Empty = ({ text }: { text: string }) => (
  <p className="text-sm text-nexus-muted">{text}</p>
);

export default function MyDayPage() {
  const { data, loading, error } = useApiData<{ brief: DayBrief }>(
    "/verticals/medicine/day",
  );
  const speech = useSpeech();
  const brief = data?.brief;
  const { speak } = speech;
  const spoken = useRef(false);
  // Al abrir, Nexus lee el resumen del día (salvo que la voz esté silenciada).
  useEffect(() => {
    if (!brief || spoken.current) return;
    spoken.current = true;
    if (!isVoiceMuted()) void speak(brief.spoken);
  }, [brief, speak]);
  const suggestions = [...(brief?.suggestions ?? [])].sort(
    (a, b) => a.priority - b.priority,
  );
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title="Mi día"
        detail={
          brief
            ? `${brief.greeting}. Hoy es ${brief.date}.`
            : "Turnos, pendientes y borradores de hoy."
        }
      />
      <div className="flex flex-wrap gap-3">
        <Link className={`${clinicalButton} text-base`} href="/patients/capture">
          🎙 Dictar / anotar
        </Link>
        {brief && speech.ttsSupported && (
          <button
            type="button"
            className={clinicalSecondary}
            onClick={() =>
              speech.speaking ? speech.cancelSpeech() : void speech.speak(brief.spoken)
            }
          >
            {speech.speaking ? "Detener" : "🔊 Escuchar"}
          </button>
        )}
      </div>
      <ClinicalError message={error} />
      {loading && !brief && <p role="status">Preparando tu día…</p>}
      {brief && (
        <>
          {suggestions.length > 0 && (
            <Section title="Sugerencias">
              <ul className="flex flex-col gap-2">
                {suggestions.map((s) => {
                  const body = (
                    <span className={s.priority === 1 ? "font-medium text-nexus-amber" : ""}>
                      {s.priority === 1 && "● "}
                      {s.text}
                      {s.href && <span className="ml-1 text-xs text-nexus-cyan">→</span>}
                    </span>
                  );
                  return (
                    <li
                      key={s.id}
                      className={`rounded-xl border p-3 text-sm ${s.priority === 1 ? "border-nexus-amber/60 bg-nexus-amber/10" : "border-nexus-border"}`}
                    >
                      {s.href ? <Link href={s.href}>{body}</Link> : body}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <Section title="Turnos de hoy">
            {brief.appointments.length ? (
              <ul className="flex flex-col gap-2">
                {brief.appointments.map((a) => {
                  const isNext = brief.next?.id === a.id;
                  return (
                    <li
                      key={a.id}
                      className={`rounded-xl border p-3 text-sm ${isNext ? "border-nexus-cyan" : "border-nexus-border"}`}
                    >
                      <span className="font-mono">{time(a.startAt)}</span>
                      {a.endAt && <span className="text-nexus-muted"> – {time(a.endAt)}</span>} · {a.title}
                      {isNext && (
                        <span className="ml-2 rounded-full bg-nexus-cyan/20 px-2 py-0.5 text-xs text-nexus-cyan">
                          Próximo
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty text="No hay turnos agendados para hoy." />
            )}
          </Section>

          <Section title="Seguimientos vencidos">
            {brief.overdue.length ? (
              <ul className="flex flex-col gap-2">
                {brief.overdue.map((f) => (
                  <li key={f.id} className="text-sm">
                    <Link className="hover:text-nexus-cyan" href={`/patients/${f.subjectId}`}>
                      <strong>{f.subjectName}</strong> · {f.title}
                    </Link>
                    <span className="ml-2 text-xs text-nexus-amber">
                      {f.daysLate} {f.daysLate === 1 ? "día" : "días"} de atraso
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Sin seguimientos vencidos." />
            )}
          </Section>

          <Section title="Vencen hoy">
            {brief.dueToday.length ? (
              <ul className="flex flex-col gap-2">
                {brief.dueToday.map((f) => (
                  <li key={f.id} className="text-sm">
                    <Link className="hover:text-nexus-cyan" href={`/patients/${f.subjectId}`}>
                      <strong>{f.subjectName}</strong> · {f.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Nada vence hoy." />
            )}
            {brief.upcoming.length > 0 && (
              <p className="text-xs text-nexus-muted">
                Próximos 7 días: {brief.upcoming.length}.{" "}
                <Link className="text-nexus-cyan" href="/patients/followups">
                  Ver seguimientos
                </Link>
              </p>
            )}
          </Section>

          <Section title="Borradores para validar">
            {brief.drafts.length ? (
              <ul className="flex flex-col gap-2">
                {brief.drafts.map((d) => (
                  <li key={d.id} className="text-sm">
                    <Link className="hover:text-nexus-cyan" href={`/patients/${d.subjectId}`}>
                      <strong>{d.subjectName}</strong>
                    </Link>
                    <span className="ml-2 text-xs text-nexus-muted">
                      {d.hoursOld < 1
                        ? "hace menos de una hora"
                        : d.hoursOld < 48
                          ? `hace ${d.hoursOld} h`
                          : `desde ${day(d.updatedAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No hay borradores pendientes." />
            )}
          </Section>

          <Section title="Huecos libres">
            {brief.freeSlots.length ? (
              <ul className="flex flex-wrap gap-2">
                {brief.freeSlots.map((s) => (
                  <li key={s.start} className="rounded-xl border border-nexus-border px-3 py-2 font-mono text-sm">
                    {time(s.start)} – {time(s.end)}{" "}
                    <span className="text-xs text-nexus-muted">({s.minutes} min)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No quedan huecos de 45 minutos o más." />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
