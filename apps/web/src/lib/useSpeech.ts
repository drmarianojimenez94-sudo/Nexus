"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ERRORS: Record<string, string> = {
  "not-allowed": "Permití el micrófono en el navegador y tocá Activar voz.",
  "service-not-allowed": "El reconocimiento de voz no está disponible. En iPhone, probá Safari con Siri habilitado.",
  "audio-capture": "No pude acceder al micrófono. Revisá si otra aplicación lo está usando.",
  network: "Se perdió la conexión del reconocimiento de voz. Tocá Activar voz para reintentar.",
  "language-not-supported": "Este navegador no reconoce español. Podés continuar escribiendo.",
};

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
  const speechDone = useRef<(() => void) | null>(null);
  const sttSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stopListening = useCallback(() => {
    wanted.current = false;
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setListening(false);
    setInterimTranscript("");
  }, []);

  const cancelSpeech = useCallback(() => {
    speechDone.current?.();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    stopListening();
    cancelSpeech();
    if (!ttsSupported || !text.trim()) return Promise.resolve();
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "es-AR";
      // Some browsers never send onend when autoplay is blocked. Bound the wait.
      const watchdog = setTimeout(() => {
        finish();
        window.speechSynthesis.cancel();
      }, Math.min(60000, Math.max(8000, text.length * 100)));
      function finish() {
        if (speechDone.current !== finish) return;
        clearTimeout(watchdog);
        speechDone.current = null;
        setSpeaking(false);
        resolve();
      }
      speechDone.current = finish;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = finish;
      utterance.onerror = finish;
      try { window.speechSynthesis.speak(utterance); } catch { finish(); }
    });
  }, [ttsSupported, stopListening, cancelSpeech]);

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
    const current = generation.current;
    function start() {
      if (!wanted.current || current !== generation.current || document.hidden) return;
      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) return;
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.lang = "es-AR";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      let delivered = false;
      recognition.onstart = () => {
        if (current !== generation.current) return;
        setListening(true);
        setInterimTranscript("");
      };
      recognition.onresult = (event) => {
        if (delivered || !wanted.current || current !== generation.current) return;
        let finalText = "", interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!;
          if (result.isFinal) finalText += result[0]?.transcript ?? "";
          else interim += result[0]?.transcript ?? "";
        }
        setInterimTranscript(interim);
        if (finalText.trim()) {
          delivered = true;
          stopListening();
          onResult(finalText.trim());
        }
      };
      recognition.onerror = (event) => {
        if (current !== generation.current) return;
        if (event.error === "no-speech") return;
        wanted.current = false;
        setListening(false);
        setError(ERRORS[event.error] ?? "La escucha se interrumpió. Tocá Activar voz para continuar.");
      };
      recognition.onend = () => {
        if (current !== generation.current) return;
        recognitionRef.current = null;
        setListening(false);
        setInterimTranscript("");
        if (wanted.current && !delivered) timer.current = setTimeout(start, 700);
      };
      try { recognition.start(); } catch {
        wanted.current = false;
        setError("El navegador necesita que toques Activar voz para habilitar el micrófono.");
      }
    }
    start();
  }, [sttSupported, stopListening, cancelSpeech]);

  useEffect(() => () => {
    stopListening();
    cancelSpeech();
  }, [stopListening, cancelSpeech]);

  return { sttSupported, ttsSupported, listening, speaking, interimTranscript, error, speak, startListening, stopListening, cancelSpeech };
}
