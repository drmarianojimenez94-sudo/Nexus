"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Pausa (ms) sin hablar tras la cual el dictado se detiene solo. 0 = nunca. */
export const SILENCE_OPTIONS = [
  { ms: 15_000, label: "15 segundos" },
  { ms: 30_000, label: "30 segundos" },
  { ms: 60_000, label: "1 minuto" },
  { ms: 0, label: "Nunca: solo con el botón" },
] as const;
const SILENCE_KEY = "nexus.dictation.silenceMs";
export const DEFAULT_SILENCE_MS = 30_000;

export function getSilenceMs(): number {
  try {
    const raw = localStorage.getItem(SILENCE_KEY);
    if (raw !== null && SILENCE_OPTIONS.some((o) => String(o.ms) === raw)) return Number(raw);
  } catch {
    // sin almacenamiento: valor por defecto
  }
  return DEFAULT_SILENCE_MS;
}
export function setSilenceMs(ms: number) {
  try {
    localStorage.setItem(SILENCE_KEY, String(ms));
  } catch {
    // sin almacenamiento: no se recuerda
  }
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Permití el micrófono en el navegador (candado de la barra de direcciones) y volvé a tocar el micrófono.",
  "service-not-allowed": "El reconocimiento de voz no está disponible. En iPhone, usá Safari con Siri habilitado.",
  "audio-capture": "No pude acceder al micrófono. Revisá si otra aplicación lo está usando.",
  "language-not-supported": "Este navegador no reconoce español. Podés escribir.",
};

/** Une fragmentos de dictado sin duplicar espacios ni perder puntuación. */
export function joinTranscript(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Dictado continuo: escucha hasta que la persona toca "Listo" o hasta una
 * pausa larga real (configurable). Los navegadores cortan el reconocimiento
 * solos después de unos segundos de silencio o de un rato hablando; acá se
 * reanuda automáticamente sin perder lo dicho, así respirar o pensar no corta
 * el dictado.
 */
export function useDictation() {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** El micrófono se cortó solo (no lo detuvo la persona): lo dictado se conserva. */
  const [interrupted, setInterrupted] = useState(false);
  /** Lo dictado ya se entregó (Listo/pausa larga) o se descartó: el próximo dictado empieza vacío. */
  const consumed = useRef(true);
  const recognition = useRef<SpeechRecognition | null>(null);
  const wanted = useRef(false);
  const parts = useRef<string[]>([]);
  const lastSpeech = useRef(0);
  const silenceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoStop = useRef<((text: string) => void) | null>(null);
  const supported = typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const clearTimers = () => {
    if (silenceTimer.current) clearInterval(silenceTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    silenceTimer.current = null;
    restartTimer.current = null;
  };

  const halt = useCallback((): string => {
    wanted.current = false;
    clearTimers();
    const r = recognition.current;
    recognition.current = null;
    // stop() (no abort) entrega el último fragmento pendiente si lo hay.
    try {
      r?.stop();
    } catch {
      // ya estaba detenido
    }
    setListening(false);
    setInterim("");
    setInterrupted(false);
    consumed.current = true;
    return joinTranscript(parts.current);
  }, []);

  /** Detiene y devuelve todo lo dictado. */
  const stop = useCallback(() => halt(), [halt]);

  const reset = useCallback((text = "") => {
    consumed.current = true;
    setInterrupted(false);
    parts.current = text ? [text] : [];
    setFinalText(text);
    setInterim("");
  }, []);

  const start = useCallback(
    (options: { onAutoStop?: (text: string) => void; keep?: boolean } = {}) => {
      setError(null);
      if (!supported) {
        setError("Este navegador no reconoce voz. Usá Chrome o Safari, o el dictado del teclado del celular.");
        return false;
      }
      if (!window.isSecureContext) {
        setError("El micrófono necesita una conexión segura (https).");
        return false;
      }
      // Si el micrófono se había cortado solo, se sigue sumando a lo ya dictado.
      if (!options.keep && consumed.current) reset();
      consumed.current = false;
      setInterrupted(false);
      onAutoStop.current = options.onAutoStop ?? null;
      wanted.current = true;
      lastSpeech.current = Date.now();
      const silenceMs = getSilenceMs();
      clearTimers();
      if (silenceMs > 0)
        silenceTimer.current = setInterval(() => {
          if (wanted.current && Date.now() - lastSpeech.current > silenceMs) {
            const text = halt();
            onAutoStop.current?.(text);
          }
        }, 1000);

      const run = () => {
        if (!wanted.current) return;
        const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!Ctor) return;
        const r = new Ctor();
        recognition.current = r;
        r.lang = "es-AR";
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.onstart = () => setListening(true);
        r.onresult = (event) => {
          let pending = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]!;
            const text = result[0]?.transcript ?? "";
            if (result.isFinal) {
              parts.current.push(text);
              setFinalText(joinTranscript(parts.current));
            } else pending += text;
          }
          if (pending.trim() || event.results.length) lastSpeech.current = Date.now();
          setInterim(pending);
        };
        r.onerror = (event) => {
          if (event.error === "no-speech" || event.error === "aborted" || event.error === "network") return;
          wanted.current = false;
          clearTimers();
          setListening(false);
          setInterrupted(true);
          setError(ERRORS[event.error] ?? "El micrófono se cortó. Lo que dijiste está guardado: tocá «Seguir dictando» o «Listo».");
        };
        r.onend = () => {
          if (recognition.current === r) recognition.current = null;
          setInterim("");
          // El navegador cortó solo (silencio o límite de tiempo): seguimos escuchando.
          if (wanted.current) restartTimer.current = setTimeout(run, 250);
          else setListening(false);
        };
        try {
          r.start();
        } catch {
          // iPhone a veces no deja reanudar solo: lo dicho queda guardado.
          wanted.current = false;
          clearTimers();
          setListening(false);
          setInterrupted(true);
          setError("El micrófono se cortó. Lo que dijiste está guardado: tocá «Seguir dictando» o «Listo».");
        }
      };
      run();
      return true;
    },
    [supported, reset, halt],
  );

  useEffect(() => () => void halt(), [halt]);

  return {
    supported,
    listening,
    /** Todo lo dictado hasta ahora, incluido lo que se está reconociendo. */
    text: joinTranscript([finalText, interim]),
    finalText,
    error,
    interrupted,
    start,
    stop,
    reset,
  };
}
