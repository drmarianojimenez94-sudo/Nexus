"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NexusFace, type FaceState } from "./NexusFace";
import { useSpeech } from "@/lib/useSpeech";
import { handleVoiceCommand, type ConversationTurn } from "@/lib/voiceCommands";
import { api } from "@/lib/api";

export function VoiceSession({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { sttSupported, listening, speaking, interimTranscript, error, speak, startListening, stopListening, cancelSpeech } = useSpeech();
  const [reply, setReply] = useState("Hola. Soy Nexus. ¿Qué hacemos hoy?");
  const [heard, setHeard] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const history = useRef<ConversationTurn[]>([]);
  const active = useRef(false);
  const processing = useRef(false);
  const sessionVersion = useRef(0);
  const handler = useRef<(text: string) => void>(() => {});

  const listen = useCallback(() => {
    if (active.current && !document.hidden) startListening((text) => handler.current(text));
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
      const result = await handleVoiceCommand(text, history.current);
      if (!active.current || version !== sessionVersion.current) return;
      history.current = [...history.current, { role: "user" as const, content: text }, { role: "assistant" as const, content: result.speak.slice(0, 2000) }].slice(-12);
      setReply(result.speak);
      if (result.navigateTo) {
        setDestination(result.navigateTo);
        router.push(result.navigateTo);
      }
      setBusy(false);
      await speak(result.speak);
      if (!active.current || version !== sessionVersion.current) return;
      if (result.close) { onClose(); return; }
    } catch {
      if (active.current && version === sessionVersion.current) setReply("No pude completar la solicitud. Podés reintentar o escribirla.");
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
      if (event.key !== "Tab") return;
      const controls = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", escape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      active.current = false;
      sessionVersion.current++;
      stopListening();
      cancelSpeech();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", escape);
    };
  }, [listen, stopListening, cancelSpeech, onClose]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ aiConfigured: boolean }>("/assistant/status").then((res) => {
      if (!cancelled) setAiReady(res.aiConfigured);
    }).catch(() => { if (!cancelled) setAiReady(false); });
    return () => { cancelled = true; };
  }, []);

  const state: FaceState = error ? "action-required" : busy ? "thinking" : speaking ? "speaking" : listening ? "listening" : "idle";
  const status = busy ? "PROCESANDO" : speaking ? "RESPONDIENDO" : listening ? "TE ESCUCHO" : paused ? "EN PAUSA" : "LISTO PARA VOS";

  return (
    <div role="dialog" aria-modal="true" aria-label="Asistente Nexus" className="voice-console fixed inset-0 z-50 overflow-y-auto">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-5 pb-8 pt-6 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <div><p className="font-mono text-xs tracking-[0.3em] text-nexus-cyan">NEXUS</p><p className="mt-1 text-xs text-nexus-muted">Tu asistente personal</p></div>
          <button autoFocus onClick={onClose} className="rounded-full border border-nexus-border px-4 py-2 text-sm">Ver mi panel</button>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
          <p className="font-mono text-xs tracking-[0.25em] text-nexus-cyan" role="status">{status}</p>
          <div className="voice-core" data-state={state} aria-hidden="true">
            <span className="voice-ring voice-ring-outer" /><span className="voice-ring voice-ring-inner" />
            <NexusFace size={144} state={state} />
          </div>
          <div className="flex h-7 items-center gap-1" aria-hidden="true">
            {Array.from({ length: 19 }, (_, i) => <span key={i} className={`voice-wave ${listening || speaking ? "voice-wave-active" : ""}`} style={{ animationDelay: `${i * 65}ms`, height: `${6 + (i % 5) * 4}px` }} />)}
          </div>
          <div className="w-full max-w-xl">
            <p className="text-xl leading-relaxed sm:text-2xl" aria-live="polite">{reply}</p>
            <p className="mt-4 min-h-6 text-sm text-nexus-muted">{interimTranscript || heard ? `“${interimTranscript || heard}”` : "Podés pedirme tareas, recordatorios o conversar."}</p>
          </div>
          {error && <p role="alert" className="max-w-md rounded-xl border border-nexus-amber/40 bg-nexus-panel p-3 text-sm text-nexus-amber">{error}</p>}
          {!sttSupported && <p className="max-w-md text-sm text-nexus-muted">Tu navegador no ofrece voz. En iPhone, abrí Nexus con Safari o usá el dictado del teclado.</p>}
          <div className="flex flex-wrap justify-center gap-3">
            {sttSupported && <button disabled={busy} onClick={() => { cancelSpeech(); listen(); }} className="rounded-full border border-nexus-cyan/50 px-5 py-2 text-sm text-nexus-cyan disabled:opacity-50">{speaking ? "Interrumpir y hablar" : "Activar voz"}</button>}
            <button disabled={busy || !reply} onClick={() => { void speak(reply).then(listen); }} className="rounded-full border border-nexus-border px-5 py-2 text-sm disabled:opacity-50">Escuchar respuesta</button>
          </div>
          {destination && <p className="text-xs text-nexus-cyan">Panel actualizado: {destination.slice(1)}</p>}
        </main>
        <footer className="mx-auto w-full max-w-xl">
          <form onSubmit={(event) => { event.preventDefault(); handler.current(draft.trim()); }} className="flex gap-2 rounded-2xl border border-nexus-border bg-nexus-panel/80 p-2">
            <input aria-label="Mensaje para Nexus" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="También podés escribir…" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none" />
            <button disabled={busy || !draft.trim()} className="rounded-xl bg-nexus-cyan px-4 text-sm font-medium text-nexus-bg disabled:opacity-40">Enviar</button>
          </form>
          <p className="mt-3 text-center text-xs text-nexus-muted">{aiReady === null ? "Comprobando conexión…" : aiReady ? "IA conectada · Conversación y acciones" : "IA sin configurar · Comandos básicos disponibles"} · Micrófono activo solo en esta pantalla.</p>
        </footer>
      </div>
    </div>
  );
}
