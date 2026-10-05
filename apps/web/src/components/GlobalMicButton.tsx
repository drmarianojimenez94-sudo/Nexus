"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { CLINICAL_HANDOFF_KEY } from "@/lib/clinicalCapture";
import { useDictation } from "@/lib/dictation";
import { clinicalCaptureUrl, isClinicalDictation } from "@/lib/dictationRouting";
import { announce, stopSpeaking } from "@/lib/voice";
import { handleVoiceCommand, type VoiceCommandResult } from "@/lib/voiceCommands";
import { AssistantActionCards } from "./AssistantActionCards";

/**
 * idle: nada. starting: pidiendo el micrófono. listening: escuchando.
 * cut: el micrófono se cortó solo y lo dicho está guardado. working:
 * procesando. done: resultado. cancelled: se descartó a pedido.
 */
type Phase = "idle" | "starting" | "listening" | "cut" | "working" | "done" | "cancelled";

const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // sin vibración
  }
};

/**
 * Botón grande de micrófono, siempre a mano. Un toque empieza; el siguiente
 * toque es siempre «Listo» (nunca cancela). Escucha hasta «Listo» o una pausa
 * larga; si el navegador corta el micrófono, lo dicho queda guardado. Después
 * decide: una consulta arma la ficha del paciente; un turno, alarma, mail,
 * clima o pregunta va al secretario.
 */
export function GlobalMicButton({ hidden = false }: { hidden?: boolean }) {
  const dictation = useDictation();
  const router = useRouter();
  const path = usePathname() || "";
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<VoiceCommandResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El reconocedor confirma que arrancó, o se cortó solo.
  useEffect(() => {
    if (dictation.listening && (phase === "starting" || phase === "cut")) setPhase("listening");
    if (!dictation.listening && dictation.interrupted && (phase === "listening" || phase === "starting")) {
      vibrate(80);
      setPhase("cut");
    }
  }, [dictation.listening, dictation.interrupted, phase]);

  // Escape: cancela desde cualquier parte de la pantalla.
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => {
    if (cancelledTimer.current) clearTimeout(cancelledTimer.current);
  }, []);

  async function process(text: string) {
    vibrate(30);
    setHeard(text);
    setResult(null);
    if (!text.trim()) {
      setNotice("No escuché nada. Tocá el micrófono y hablá: te escucho hasta que toques «Listo».");
      setPhase("done");
      return;
    }
    setNotice(null);
    setPhase("working");
    if (isClinicalDictation(text, path)) {
      try {
        sessionStorage.setItem(CLINICAL_HANDOFF_KEY, text);
      } catch {
        // sin almacenamiento: se vuelve a dictar en la pantalla clínica
      }
      setNotice("✓ Recibido. Armando la ficha del paciente…");
      setPhase("done");
      announce("Armando la ficha.");
      router.push(clinicalCaptureUrl(path));
      return;
    }
    try {
      const res = await handleVoiceCommand(text, [], user?.id);
      setResult(res);
      setPhase("done");
      if (res.speak) announce(res.speak);
      if (res.navigateTo) {
        const target = res.navigateTo.startsWith("/patients/capture") && !res.navigateTo.includes("auto=") ? clinicalCaptureUrl(path) : res.navigateTo;
        router.push(target);
      }
    } catch {
      setNotice("No pude procesarlo. Revisá la conexión: lo que dijiste está acá arriba para repetirlo.");
      setPhase("done");
    }
  }

  function begin() {
    stopSpeaking();
    setResult(null);
    setNotice(null);
    setHeard("");
    setPhase("starting");
    vibrate(30);
    if (!dictation.start({ onAutoStop: (text) => void process(text) })) setPhase("done");
  }

  /** El botón grande: empieza, o termina («Listo»). Nunca cancela. */
  function press() {
    if (phase === "starting" || phase === "working") return;
    if (phase === "listening" || phase === "cut") {
      void process(dictation.stop());
      return;
    }
    begin();
  }

  function resume() {
    setNotice(null);
    setPhase("starting");
    dictation.start({ keep: true, onAutoStop: (text) => void process(text) });
  }

  function cancel() {
    const hadText = Boolean(dictation.text.trim());
    if (dictation.listening || phase === "cut" || phase === "starting") dictation.stop();
    dictation.reset();
    setResult(null);
    if (phase === "listening" || phase === "cut" || phase === "starting") {
      setNotice(hadText ? "✕ Cancelado: no se guardó nada de lo que dictaste." : "✕ Cancelado.");
      setPhase("cancelled");
      if (cancelledTimer.current) clearTimeout(cancelledTimer.current);
      cancelledTimer.current = setTimeout(() => setPhase((p) => (p === "cancelled" ? "idle" : p)), 2500);
    } else setPhase("idle");
  }

  if (hidden && phase === "idle") return null;
  const active = phase === "listening" || phase === "cut";
  const label =
    phase === "starting" ? "Abriendo…" : phase === "listening" ? "Listo" : phase === "cut" ? "Listo" : phase === "working" ? "Procesando" : "Dictar";

  return (
    <>
      {phase !== "idle" && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Dictado"
          className="fixed inset-x-3 bottom-[11.5rem] z-[70] mx-auto max-w-xl rounded-2xl border border-nexus-border bg-nexus-bg/95 p-4 shadow-2xl backdrop-blur sm:bottom-32"
        >
          {phase === "starting" && (
            <p role="status" className="text-base font-semibold">
              Abriendo el micrófono… <span className="font-normal text-nexus-muted">si el navegador pregunta, tocá «Permitir».</span>
            </p>
          )}
          {phase === "listening" && (
            <>
              <p role="status" className="flex items-center gap-2 text-base font-semibold">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-nexus-danger" /> Te escucho
              </p>
              <p className="mt-1 text-xs text-nexus-muted">
                Hablá tranquilo, las pausas no cortan. Tocá <strong>■ Listo</strong> al terminar.
              </p>
              <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-relaxed">{dictation.text || "…"}</p>
            </>
          )}
          {phase === "cut" && (
            <>
              <p role="alert" className="text-base font-semibold text-nexus-amber">
                ⏸ El micrófono se cortó, pero no perdiste nada
              </p>
              <p className="mt-2 max-h-40 overflow-y-auto text-sm leading-relaxed">
                {dictation.text ? `Guardado: «${dictation.text}»` : "Todavía no había escuchado nada."}
              </p>
              {dictation.error && !dictation.error.startsWith("El micrófono se cortó") && (
                <p className="mt-1 text-xs text-nexus-amber">{dictation.error}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={resume} className="min-h-12 flex-1 rounded-xl bg-nexus-cyan px-4 text-sm font-semibold text-nexus-bg">
                  🎙 Seguir dictando
                </button>
                <button
                  type="button"
                  onClick={() => void process(dictation.stop())}
                  disabled={!dictation.text.trim()}
                  className="min-h-12 flex-1 rounded-xl bg-nexus-danger px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  ■ Listo, procesar
                </button>
              </div>
            </>
          )}
          {phase === "working" && (
            <p role="status" className="text-base">
              ⏳ Procesando lo que dijiste…
            </p>
          )}
          {phase === "cancelled" && (
            <p role="status" className="text-base">
              {notice}
            </p>
          )}
          {phase === "done" && (
            <div className="flex flex-col gap-3">
              {dictation.error && <p role="alert" className="text-sm text-nexus-amber">{dictation.error}</p>}
              {notice && <p role="status" className="text-base">{notice}</p>}
              {heard && <p className="text-xs text-nexus-muted">Dijiste: «{heard}»</p>}
              {result?.speak && <p role="status" className="text-base">✓ {result.speak}</p>}
              <AssistantActionCards alarm={result?.alarm} event={result?.event} emailDraft={result?.emailDraft} sources={result?.sources} />
            </div>
          )}
          {phase !== "working" && phase !== "cancelled" && (
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 rounded-xl border border-nexus-border px-4 py-2 text-sm" onClick={cancel}>
                {phase === "done" ? "Cerrar" : "Cancelar y borrar"}
              </button>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={press}
        aria-pressed={active}
        aria-busy={phase === "starting" || phase === "working"}
        aria-label={active ? "Listo: terminar de dictar y procesar" : "Dictar: tocá y hablá"}
        className={`fixed bottom-24 right-4 z-[71] flex h-20 w-20 flex-col items-center justify-center rounded-full text-nexus-bg shadow-2xl transition sm:bottom-6 sm:right-6 ${
          phase === "listening"
            ? "animate-pulse bg-nexus-danger text-white"
            : phase === "cut"
              ? "bg-nexus-danger text-white"
              : phase === "starting" || phase === "working"
                ? "bg-nexus-muted"
                : "bg-nexus-cyan"
        }`}
      >
        <span className="text-3xl leading-none" aria-hidden>
          {active ? "■" : phase === "starting" || phase === "working" ? "…" : "🎙"}
        </span>
        <span className="mt-1 text-[11px] font-semibold">{label}</span>
      </button>
    </>
  );
}
