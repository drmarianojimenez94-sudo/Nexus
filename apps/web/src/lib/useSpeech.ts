"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps the two halves of Nexus Voice V1 (spec §5, Fase 2):
 *
 * - speak(): window.speechSynthesis — works on iOS Safari, Chrome, Edge.
 * - startListening()/stopListening(): SpeechRecognition — works on Chrome
 *   (desktop and Android). iOS Safari has never implemented it, in any
 *   browser on iOS (same "every browser is WebKit" constraint as Web
 *   Bluetooth). `sttSupported` tells the caller which UI to show instead
 *   of pretending it might work.
 */
export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef<((text: string) => void) | null>(null);

  const sttSupported =
    typeof window !== "undefined" && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (ttsSupported) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (!ttsSupported || !text.trim()) return Promise.resolve();
      return new Promise((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-AR";
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => {
          setSpeaking(false);
          resolve();
        };
        utterance.onerror = () => {
          setSpeaking(false);
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      });
    },
    [ttsSupported]
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(
    (onResult: (text: string) => void) => {
      if (!sttSupported) return;
      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) return;

      onResultRef.current = onResult;
      const recognition = new Ctor();
      recognition.lang = "es-AR";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setListening(true);
        setInterimTranscript("");
      };
      recognition.onresult = (event) => {
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!;
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += text;
          else interim += text;
        }
        setInterimTranscript(interim);
        if (finalText.trim()) {
          onResultRef.current?.(finalText.trim());
        }
      };
      recognition.onerror = () => {
        setListening(false);
      };
      recognition.onend = () => {
        setListening(false);
        setInterimTranscript("");
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [sttSupported]
  );

  return {
    sttSupported,
    ttsSupported,
    listening,
    speaking,
    interimTranscript,
    speak,
    startListening,
    stopListening,
  };
}
