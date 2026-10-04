"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { CLINICAL_HANDOFF_KEY } from "@/lib/clinicalCapture";
import { useDictation } from "@/lib/dictation";
import { clinicalCaptureUrl, isClinicalDictation } from "@/lib/dictationRouting";
import { announce, stopSpeaking } from "@/lib/voice";
import { handleVoiceCommand, type VoiceCommandResult } from "@/lib/voiceCommands";
import { AssistantActionCards } from "./AssistantActionCards";

type Phase = "idle" | "listening" | "working" | "done";

/**
 * Botón grande de micrófono, siempre a mano. Escucha hasta que tocás
 * «Listo» (las pausas para respirar no cortan) y después decide: una
 * consulta arma la ficha del paciente; un turno, alarma o mail va al
 * secretario.
 */
export function GlobalMicButton({ hidden = false }: { hidden?: boolean }) {
  const dictation = useDictation();
  const router = useRouter();
  const path = usePathname() || "";
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<VoiceCommandResult | null>(null);

  useEffect(() => {
    if (dictation.listening) setPhase("listening");
  }, [dictation.listening]);

  async function process(text: string) {
    setHeard(text);
    if (!text.trim()) {
      setPhase("idle");
      return;
    }
    setPhase("working");
    if (isClinicalDictation(text, path)) {
      try {
        sessionStorage.setItem(CLINICAL_HANDOFF_KEY, text);
      } catch {
        // sin almacenamiento: se vuelve a dictar en la pantalla clínica
      }
      setPhase("idle");
      announce("Armando la ficha.");
      router.push(clinicalCaptureUrl(path));
      return;
    }
    const res = await handleVoiceCommand(text, [], user?.id);
    setResult(res);
    setPhase("done");
    if (res.speak) announce(res.speak);
    if (res.navigateTo) {
      const target = res.navigateTo.startsWith("/patients/capture") && !res.navigateTo.includes("auto=") ? clinicalCaptureUrl(path) : res.navigateTo;
      router.push(target);
      if (!res.alarm && !res.event && !res.emailDraft) setPhase("idle");
    }
  }

  function toggle() {
    if (dictation.listening) {
      void process(dictation.stop());
      return;
    }
    stopSpeaking();
    setResult(null);
    setHeard("");
    if (dictation.start({ onAutoStop: (text) => void process(text) })) setPhase("listening");
    else setPhase("done");
  }

  function close() {
    if (dictation.listening) dictation.stop();
    setPhase("idle");
    setResult(null);
  }

  if (hidden && phase === "idle") return null;
  const listening = dictation.listening;

  return (
    <>
      {phase !== "idle" && (
        <div
          role="dialog"
          aria-label="Dictado"
          className="fixed inset-x-3 bottom-[11.5rem] z-[70] mx-auto max-w-xl rounded-2xl border border-nexus-border bg-nexus-bg/95 p-4 shadow-2xl backdrop-blur sm:bottom-32"
        >
          {phase === "listening" && (
            <>
              <p className="flex items-center gap-2 text-base font-semibold">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-nexus-danger" /> Te escucho
              </p>
              <p className="mt-1 text-xs text-nexus-muted">
                Hablá tranquilo, las pausas no cortan. Podés dictar una consulta, un turno, una alarma o un mail. Tocá <strong>Listo</strong> al terminar.
              </p>
              <p className="mt-3 max-h-40 overflow-y-auto text-sm leading-relaxed">{dictation.text || "…"}</p>
            </>
          )}
          {phase === "working" && <p className="text-sm">Procesando lo que dijiste…</p>}
          {phase === "done" && (
            <div className="flex flex-col gap-3">
              {dictation.error && <p role="alert" className="text-sm text-nexus-amber">{dictation.error}</p>}
              {heard && <p className="text-xs text-nexus-muted">Dijiste: «{heard}»</p>}
              {result?.speak && <p className="text-base">{result.speak}</p>}
              <AssistantActionCards alarm={result?.alarm} event={result?.event} emailDraft={result?.emailDraft} />
            </div>
          )}
          {phase !== "listening" && phase !== "working" && (
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-nexus-border px-4 py-2 text-sm" onClick={close}>
                Cerrar
              </button>
            </div>
          )}
          {phase === "listening" && (
            <div className="mt-3 flex justify-end">
              <button type="button" className="rounded-xl px-3 py-2 text-sm text-nexus-muted" onClick={close}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "Listo: terminar de dictar" : "Dictar: tocá y hablá"}
        className={`fixed bottom-24 right-4 z-[71] flex h-20 w-20 flex-col items-center justify-center rounded-full text-nexus-bg shadow-2xl transition sm:bottom-6 sm:right-6 ${
          listening ? "animate-pulse bg-nexus-danger text-white" : "bg-nexus-cyan"
        }`}
      >
        <span className="text-3xl leading-none" aria-hidden>
          {listening ? "■" : "🎙"}
        </span>
        <span className="mt-1 text-[11px] font-semibold">{listening ? "Listo" : "Dictar"}</span>
      </button>
    </>
  );
}
