"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type {
  AlarmAction,
  EmailDraftAction,
  EventAction,
} from "@/lib/voiceCommands";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
const when = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

const card =
  "rounded-2xl border border-nexus-cyan/30 bg-nexus-panel/80 p-3 text-left text-sm";
const chip =
  "inline-flex min-h-9 items-center rounded-full border border-nexus-border px-3 py-1.5 text-xs";

/** Redacción en Gmail sin conexión de Nexus: el usuario la revisa y envía allí. */
function gmailComposeUrl(d: EmailDraftAction) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: d.to.replace(/^.*<([^>]+)>.*$/, "$1"),
    su: d.subject,
    body: d.body,
  });
  return `https://mail.google.com/mail/?${params}`;
}

function EmailDraftCard({ draft }: { draft: EmailDraftAction }) {
  const [step, setStep] = useState<"idle" | "confirm" | "sending" | "sent">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const canSend = draft.connected && !!draft.id && !!draft.confirmationToken;

  async function send() {
    if (!canSend) return;
    setStep("sending");
    setError(null);
    try {
      await api.post(
        `/google-workspace/drafts/${encodeURIComponent(draft.id!)}/send`,
        { confirmed: true, confirmationToken: draft.confirmationToken },
      );
      setStep("sent");
    } catch (e) {
      setStep("confirm");
      setError(e instanceof Error ? e.message : "No se pudo enviar el correo.");
    }
  }

  return (
    <section className={card} aria-label="Borrador de correo">
      <p className="hud-label text-nexus-cyan">
        {step === "sent" ? "Correo enviado" : "Borrador de correo"}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-nexus-muted">Para</dt>
        <dd className="min-w-0 break-words">{draft.to}</dd>
        <dt className="text-nexus-muted">Asunto</dt>
        <dd className="min-w-0 break-words">{draft.subject}</dd>
      </dl>
      <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-nexus-border p-2">
        {draft.body}
      </p>
      {!canSend && (
        <p className="mt-2 text-xs text-nexus-amber">
          {draft.note ?? "Gmail no está conectado: no puedo enviarlo desde Nexus."}{" "}
          <Link href="/settings#google" className="text-nexus-cyan underline">
            Conectar Google en Ajustes
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-nexus-danger">
          {error}
        </p>
      )}
      {step === "sent" ? (
        <p role="status" className="mt-2 text-xs text-nexus-cyan">
          ✓ Enviado desde tu Gmail.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {canSend && step === "idle" && (
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="inline-flex min-h-9 items-center rounded-full bg-nexus-cyan px-4 py-1.5 text-xs font-medium text-nexus-bg"
            >
              Enviar
            </button>
          )}
          {canSend && step !== "idle" && (
            <>
              <button
                type="button"
                disabled={step === "sending"}
                onClick={() => void send()}
                className="inline-flex min-h-9 items-center rounded-full bg-nexus-cyan px-4 py-1.5 text-xs font-medium text-nexus-bg disabled:opacity-50"
              >
                {step === "sending" ? "Enviando…" : `Sí, enviar a ${draft.to}`}
              </button>
              <button
                type="button"
                disabled={step === "sending"}
                onClick={() => setStep("idle")}
                className={chip}
              >
                Cancelar
              </button>
            </>
          )}
          {draft.id ? (
            <a
              href="https://mail.google.com/mail/u/0/#drafts"
              target="_blank"
              rel="noopener noreferrer"
              className={chip}
            >
              Abrir en Gmail para editar
            </a>
          ) : (
            <a
              href={gmailComposeUrl(draft)}
              target="_blank"
              rel="noopener noreferrer"
              className={chip}
            >
              Editar en Gmail
            </a>
          )}
        </div>
      )}
    </section>
  );
}

/** Confirmaciones visibles de lo que hizo el asistente: alarma, evento, correo. */
export function AssistantActionCards({
  alarm,
  event,
  emailDraft,
  sources,
}: {
  alarm?: AlarmAction;
  event?: EventAction;
  emailDraft?: EmailDraftAction;
  /** De dónde salió una respuesta con datos de internet. */
  sources?: { title: string; url: string }[];
}) {
  if (!alarm && !event && !emailDraft && !sources?.length) return null;
  return (
    <div className="flex w-full flex-col gap-2">
      {alarm && (
        <section className={card} aria-label="Alarma">
          <p className="text-base">
            ⏰ Alarma <span className="font-mono text-nexus-cyan">{time(alarm.at)}</span>{" "}
            · {alarm.title}
          </p>
          <p className="mt-1 text-xs text-nexus-muted">
            {new Date(alarm.at).toDateString() === new Date().toDateString()
              ? "Hoy. "
              : `${when(alarm.at)}. `}
            En la web queda como recordatorio de Nexus; en el teléfono, la app
            programa la alarma.
          </p>
        </section>
      )}
      {event && (
        <section className={card} aria-label="Evento">
          <p className="text-base">
            📅 {event.title} ·{" "}
            <span className="text-nexus-cyan">{when(event.startAt)}</span>
          </p>
          <p className="mt-1 text-xs text-nexus-muted">
            {event.google ? (
              "Agendado en Nexus y en Google Calendar."
            ) : (
              <>
                Agendado en Nexus.{" "}
                <Link href="/settings#google" className="text-nexus-cyan underline">
                  Conectá Google Calendar
                </Link>{" "}
                para verlo también allí.
              </>
            )}
          </p>
        </section>
      )}
      {emailDraft && <EmailDraftCard key={emailDraft.id ?? emailDraft.subject} draft={emailDraft} />}
      {!!sources?.length && (
        <p className="text-xs text-nexus-muted">
          🌐 Fuentes:{" "}
          {sources.map((src, i) => (
            <span key={src.url}>
              {i > 0 && " · "}
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-nexus-cyan underline">
                {src.title}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
