import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useRef, useState } from "react";

export interface DictationOptions {
  /** Términos del dominio que el reconocedor debe privilegiar (vertical.vocabulary.domainTerms). */
  contextualStrings?: string[];
}

/**
 * Dictado nativo (expo-speech-recognition). Escucha solo mientras el
 * profesional lo pide, en el dispositivo cuando el sistema lo soporta, y no
 * guarda audio (`recordingOptions` sin `persist`). Requiere un development
 * build: Expo Go no incluye el módulo.
 */
export function useDictation({ contextualStrings = [] }: DictationOptions = {}) {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);
  const finalRef = useRef("");

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setPartial("");
  });
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalRef.current = `${finalRef.current} ${text}`.trim();
      setFinalText(finalRef.current);
      setPartial("");
    } else setPartial(text);
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error !== "aborted" && event.error !== "no-speech") setError(event.message || "No se pudo usar el dictado.");
  });

  const available = (() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  })();

  const start = useCallback(async () => {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError("Sin permiso de micrófono: podés escribir la nota con el teclado.");
      return false;
    }
    const local = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    setOnDevice(local);
    ExpoSpeechRecognitionModule.start({
      lang: "es-AR",
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: local,
      contextualStrings: contextualStrings.slice(0, 100),
    });
    return true;
  }, [contextualStrings]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  const reset = useCallback((text = "") => {
    finalRef.current = text;
    setFinalText(text);
    setPartial("");
  }, []);

  return { available, listening, text: [finalText, partial].filter(Boolean).join(" "), finalText, error, onDevice, start, stop, reset };
}
