"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceState } from "./NexusFace";
import { NexusCore } from "./NexusCore";
import { useSpeech } from "@/lib/useSpeech";
import { handleVoiceCommand, type ConversationTurn } from "@/lib/voiceCommands";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function VoiceSession({
  onClose,
  onDockChange,
}: {
  onClose: () => void;
  onDockChange: (docked: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const {
    sttSupported,
    listening,
    speaking,
    interimTranscript,
    error,
    speak,
    startListening,
    stopListening,
    cancelSpeech,
  } = useSpeech();
  const [reply, setReply] = useState("Hola. Soy Nexus. ¿Qué hacemos hoy?");
  const [heard, setHeard] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [docked, setDocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const micMuted = useRef(false);
  const dock = useCallback(
    (value: boolean) => {
      setDocked(value);
      onDockChange(value);
    },
    [onDockChange],
  );
  const [aiReady, setAiReady] = useState<boolean | null | "error">(null);
  const history = useRef<ConversationTurn[]>([]);
  const active = useRef(false);
  const processing = useRef(false);
  const sessionVersion = useRef(0);
  const handler = useRef<(text: string) => void>(() => {});

  const listen = useCallback(() => {
    if (active.current && !document.hidden && !micMuted.current)
      startListening((text) => handler.current(text));
  }, [startListening]);

  handler.current = async (text: string) => {
    if (!active.current || processing.current || !text.trim()) return;
    processing.current = true;
    const version = sessionVersion.current;
    stopListening();
    setBusy(true);
    setHeard(text);
    setDraft("");
    try {
      const result = await handleVoiceCommand(text, history.current, user?.id);
      if (!active.current || version !== sessionVersion.current) return;
      history.current = [
        ...history.current,
        { role: "user" as const, content: text },
        { role: "assistant" as const, content: result.speak.slice(0, 2000) },
      ].slice(-12);
      setReply(result.speak);
      if (result.navigateTo) {
        dock(true);
        router.push(result.navigateTo);
      }
      setBusy(false);
      await speak(result.speak);
      if (!active.current || version !== sessionVersion.current) return;
      if (result.close) {
        onClose();
        return;
      }
    } catch {
      if (active.current && version === sessionVersion.current)
        setReply(
          "No pude completar la solicitud. Podés reintentar o escribirla.",
        );
    } finally {
      processing.current = false;
      setBusy(false);
      if (active.current && version === sessionVersion.current) listen();
    }
  };

  useEffect(() => {
    active.current = true;
    listen(); // Listen first: an autoplay-blocked greeting must not prevent microphone startup.
    const visibility = () => {
      sessionVersion.current++;
      stopListening();
      cancelSpeech();
      setPaused(document.hidden);
      if (!document.hidden && !processing.current) listen();
    };
    document.addEventListener("visibilitychange", visibility);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (
        event.key !== "Tab" ||
        !document.querySelector(
          '[aria-modal="true"][aria-label="Asistente Nexus"]',
        )
      )
        return;
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled)',
        ),
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", escape);

    return () => {
      active.current = false;
      sessionVersion.current++;
      stopListening();
      cancelSpeech();
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", escape);
    };
  }, [listen, stopListening, cancelSpeech, onClose]);

  useEffect(() => {
    if (docked) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [docked]);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .get<{ aiConfigured: boolean }>("/assistant/status")
        .then((res) => {
          if (!cancelled) setAiReady(res.aiConfigured);
        })
        .catch(() => {
          if (!cancelled) setAiReady("error");
        });
    void check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, []);

  const state: FaceState = error
    ? "action-required"
    : busy
      ? "thinking"
      : speaking
        ? "speaking"
        : listening
          ? "listening"
          : "idle";
  const status = busy
    ? "PROCESANDO"
    : speaking
      ? "RESPONDIENDO"
      : listening
        ? "TE ESCUCHO"
        : paused || muted
          ? "MICRÓFONO EN PAUSA"
          : "LISTO PARA VOS";

  return (
    <div
      role={docked ? "region" : "dialog"}
      aria-modal={docked ? undefined : true}
      aria-label="Asistente Nexus"
      className={
        docked
          ? "voice-console voice-dock fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-nexus-cyan/30"
          : "voice-console fixed inset-0 z-50 overflow-y-auto"
      }
    >
      <div
        className={
          docked
            ? "relative p-3 sm:p-4"
            : "relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-5 pb-8 pt-6 sm:px-10"
        }
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className={docked ? "min-w-0 flex-1" : "w-full sm:w-auto"}>
            <p className="font-mono text-xs tracking-[0.3em] text-nexus-cyan">
              NEXUS
            </p>
            {!docked && (
              <p className="mt-1 text-xs text-nexus-muted">
                Tu voz. Tu agenda. Tu universo.
              </p>
            )}
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <button
              autoFocus
              onClick={() => dock(!docked)}
              className="whitespace-nowrap rounded-full border border-nexus-border px-3 py-2 text-xs"
            >
              {docked ? "Expandir" : "Ver mi panel"}
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar asistente y apagar micrófono"
              className="whitespace-nowrap rounded-full border border-nexus-border px-3 py-2 text-xs"
            >
              Cerrar
            </button>
          </div>
        </header>
        <div
          className={
            docked
              ? "my-3 flex items-center gap-3"
              : "flex flex-1 flex-col items-center justify-center gap-6 py-8 text-center"
          }
        >
          <div
            className={`voice-core ${docked ? "voice-core-compact" : ""}`}
            data-state={state}
            aria-hidden="true"
          >
            <span className="voice-ring voice-ring-outer" />
            <span className="voice-ring voice-ring-inner" />
            <NexusCore size={docked ? 34 : 172} state={state} />
            {!docked && (
              <>
                <span className="voice-target voice-target-top" />
                <span className="voice-target voice-target-bottom" />
              </>
            )}
          </div>
          <div className={docked ? "min-w-0 flex-1" : "w-full max-w-xl"}>
            <p
              className="mb-2 font-mono text-xs tracking-[0.2em] text-nexus-cyan"
              role="status"
            >
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {status}
            </p>
            <p
              className={
                docked
                  ? "max-h-20 overflow-y-auto text-sm leading-relaxed"
                  : "text-xl leading-relaxed sm:text-2xl"
              }
              aria-live="polite"
            >
              {reply}
            </p>
            {!docked && (
              <p className="mt-4 min-h-6 text-sm text-nexus-muted">
                {interimTranscript || heard
                  ? `“${interimTranscript || heard}”`
                  : "Decime ‘abrime el calendario’ o elegí un panel."}
              </p>
            )}
          </div>
          {!docked && (
            <div className="flex flex-wrap justify-center gap-2">
              {(
                [
                  ["Calendario", "abrí el calendario"],
                  ["Hoy", "abrí mi panel"],
                  ["Proyectos", "abrí proyectos"],
                ] as const
              ).map(([label, command]) => (
                <button
                  key={label}
                  disabled={busy}
                  onClick={() => handler.current(command)}
                  className="rounded-full border border-nexus-cyan/30 px-4 py-2 text-sm text-nexus-cyan disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-xl border border-nexus-amber/40 p-2 text-xs text-nexus-amber"
          >
            {error}
          </p>
        )}
        {!sttSupported && (
          <p className="mb-2 text-xs text-nexus-muted">
            Para usar la voz en iPhone, abrí Nexus con Safari o usá el dictado
            del teclado.
          </p>
        )}
        <footer className="mx-auto w-full max-w-xl">
          <div className="mb-2 flex flex-wrap justify-center gap-2">
            {sttSupported && (
              <button
                disabled={busy}
                onClick={() => {
                  if (listening && !muted) {
                    micMuted.current = true;
                    setMuted(true);
                    stopListening();
                  } else {
                    micMuted.current = false;
                    setMuted(false);
                    cancelSpeech();
                    listen();
                  }
                }}
                className="rounded-full border border-nexus-cyan/50 px-4 py-2 text-xs text-nexus-cyan disabled:opacity-50"
              >
                {listening && !muted
                  ? "Pausar micrófono"
                  : speaking
                    ? "Interrumpir y hablar"
                    : "Activar voz"}
              </button>
            )}
            <button
              disabled={busy || !reply}
              onClick={() => {
                stopListening();
                void speak(reply).then(listen);
              }}
              className="rounded-full border border-nexus-border px-4 py-2 text-xs disabled:opacity-50"
            >
              Escuchar respuesta
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handler.current(draft.trim());
            }}
            className="flex gap-2 rounded-2xl border border-nexus-border bg-nexus-panel/80 p-2"
          >
            <input
              aria-label="Mensaje para Nexus"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              placeholder="Pedile algo a Nexus…"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none sm:text-sm"
            />
            <button
              disabled={busy || !draft.trim()}
              className="rounded-xl bg-nexus-cyan px-4 text-sm font-medium text-nexus-bg disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-nexus-muted">
            {aiReady === null
              ? "Comprobando conexión…"
              : aiReady === "error"
                ? "Sin conexión al servidor"
                : aiReady
                  ? "IA configurada"
                  : "IA sin configurar"}{" "}
            · {listening ? "Micrófono activo" : "Micrófono en pausa"}
            {aiReady === false && (
              <button
                onClick={() => {
                  dock(true);
                  router.push("/settings");
                }}
                className="ml-2 text-nexus-cyan underline"
              >
                Configurar IA
              </button>
            )}
          </p>
        </footer>
      </div>
    </div>
  );
}
