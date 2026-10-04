"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak as speakText, type SpeechHandle } from "./voice";

const ERRORS: Record<string, string> = {
  "not-allowed": "Permití el micrófono en el navegador y tocá Activar voz.",
  "service-not-allowed": "El reconocimiento de voz no está disponible. En iPhone, probá Safari con Siri habilitado.",
  "audio-capture": "No pude acceder al micrófono. Revisá si otra aplicación lo está usando.",
  network: "Se perdió la conexión del reconocimiento de voz. Tocá Activar voz para reintentar.",
  "language-not-supported": "Este navegador no reconoce español. Podés continuar escribiendo.",
};

/** Pausa real (sin hablar) que cierra un turno de conversación; respirar no llega. */
export const TURN_PAUSE_MS = 4000;

/** Feature detection supports Safari's prefixed implementation as well as Chrome/Edge.
 * One recognizer owns the microphone; retries only follow a normal end/no-speech.
 * Permission/network failures require an explicit retry, never a prompt loop. */
export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wanted = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechHandle = useRef<SpeechHandle | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sttSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  const ttsSupported = typeof window !== "undefined" && ("speechSynthesis" in window || typeof Audio !== "undefined");

  const stopListening = useCallback(() => {
    wanted.current = false;
    if (pauseTimer.current) clearInterval(pauseTimer.current);
    pauseTimer.current = null;
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setListening(false);
    setInterimTranscript("");
  }, []);

  const cancelSpeech = useCallback(() => {
    // Solo corta lo que dijo este componente: una confirmación global
    // («Abriendo pacientes») sigue sonando aunque la pantalla anterior se cierre.
    const handle = speechHandle.current;
    speechHandle.current = null;
    handle?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    stopListening();
    cancelSpeech();
    if (!ttsSupported || !text.trim()) return Promise.resolve();
    const handle = speakText(text, { onStart: () => setSpeaking(true) });
    speechHandle.current = handle;
    return handle.done.then(() => {
      if (speechHandle.current !== handle && speechHandle.current) return;
      speechHandle.current = null;
      setSpeaking(false);
    });
  }, [ttsSupported, stopListening, cancelSpeech]);

  const pending = useRef<{ parts: string[]; deliver: ((text: string) => void) | null; lastSpeech: number }>({ parts: [], deliver: null, lastSpeech: 0 });

  /** Entrega ya lo dictado (botón «Listo»). */
  const finishListening = useCallback(() => {
    const { parts, deliver } = pending.current;
    const text = parts.join(" ").replace(/\s{2,}/g, " ").trim();
    pending.current = { parts: [], deliver: null, lastSpeech: 0 };
    if (pauseTimer.current) clearInterval(pauseTimer.current);
    pauseTimer.current = null;
    stopListening();
    if (text && deliver) deliver(text);
  }, [stopListening]);

  /**
   * Escucha de forma continua: las pausas para respirar no cortan. Entrega
   * todo junto cuando se toca «Listo» (finishListening) o después de una
   * pausa real de TURN_PAUSE_MS sin hablar. Si el navegador corta solo,
   * se reanuda sin perder lo dicho.
   */
  const startListening = useCallback((onResult: (text: string) => void) => {
    stopListening();
    cancelSpeech();
    setError(null);
    if (!sttSupported) {
      setError("Este navegador no ofrece reconocimiento de voz. Podés usar el dictado del teclado.");
      return;
    }
    if (!window.isSecureContext) {
      setError("La voz necesita una conexión HTTPS segura.");
      return;
    }
    wanted.current = true;
    pending.current = { parts: [], deliver: onResult, lastSpeech: Date.now() };
    const current = generation.current;
    if (pauseTimer.current) clearInterval(pauseTimer.current);
    pauseTimer.current = setInterval(() => {
      const p = pending.current;
      if (current !== generation.current) return;
      if (p.parts.length && Date.now() - p.lastSpeech > TURN_PAUSE_MS) finishListening();
    }, 500);
    function start() {
      if (!wanted.current || current !== generation.current || document.hidden) return;
      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) return;
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.lang = "es-AR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (current !== generation.current) return;
        setListening(true);
      };
      recognition.onresult = (event) => {
        if (!wanted.current || current !== generation.current) return;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!;
          if (result.isFinal) pending.current.parts.push((result[0]?.transcript ?? "").trim());
          else interim += result[0]?.transcript ?? "";
        }
        pending.current.lastSpeech = Date.now();
        setInterimTranscript([...pending.current.parts, interim].join(" ").trim());
      };
      recognition.onerror = (event) => {
        if (current !== generation.current) return;
        if (event.error === "no-speech" || event.error === "aborted" || event.error === "network") return;
        wanted.current = false;
        setListening(false);
        setError(ERRORS[event.error] ?? "La escucha se interrumpió. Tocá Activar voz para continuar.");
      };
      recognition.onend = () => {
        if (current !== generation.current) return;
        recognitionRef.current = null;
        // El navegador cortó solo (silencio corto o límite): seguimos escuchando.
        if (wanted.current) timer.current = setTimeout(start, 250);
        else setListening(false);
      };
      try { recognition.start(); } catch {
        wanted.current = false;
        setError("El navegador necesita que toques Activar voz para habilitar el micrófono.");
      }
    }
    start();
  }, [sttSupported, stopListening, cancelSpeech, finishListening]);

  useEffect(() => () => {
    stopListening();
    cancelSpeech();
  }, [stopListening, cancelSpeech]);

  return { sttSupported, ttsSupported, listening, speaking, interimTranscript, error, speak, startListening, stopListening, finishListening, cancelSpeech };
}
