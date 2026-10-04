import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useId, useRef, useState } from "react";
import { stopSpeaking, whenIdle } from "./voice";

export interface DictationOptions {
  /** Términos del dominio que el reconocedor debe privilegiar (vertical.vocabulary.domainTerms). */
  contextualStrings?: string[];
  /**
   * true (por defecto): dictado largo, sigue escuchando hasta que se detiene.
   * false: una sola frase; el reconocedor termina solo tras una pausa (consola de Inicio).
   */
  continuous?: boolean;
}

/**
 * El reconocedor es uno solo para toda la app, pero las pestañas quedan
 * montadas: cada pantalla que usa el hook se identifica y solo procesa los
 * eventos de la sesión que ella misma inició.
 */
let activeOwner: string | null = null;

/**
 * Dictado nativo (expo-speech-recognition). Escucha solo mientras el
 * profesional lo pide, en el dispositivo cuando el sistema lo soporta, y no
 * guarda audio (`recordingOptions` sin `persist`). Requiere un development
 * build: Expo Go no incluye el módulo.
 */
export function useDictation({ contextualStrings = [], continuous = true }: DictationOptions = {}) {
  const owner = useId();
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);
  const finalRef = useRef("");
  const mine = () => activeOwner === owner;

  useSpeechRecognitionEvent("start", () => {
    if (mine()) setListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (!mine()) return;
    activeOwner = null;
    setListening(false);
    setPartial("");
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!mine()) return;
    const text = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalRef.current = `${finalRef.current} ${text}`.trim();
      setFinalText(finalRef.current);
      setPartial("");
    } else setPartial(text);
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!mine()) return;
    activeOwner = null;
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
      setError("Sin permiso de micrófono: podés escribir con el teclado.");
      return false;
    }
    // Que Nexus no se escuche a sí mismo.
    stopSpeaking();
    await whenIdle();
    if (activeOwner && activeOwner !== owner) ExpoSpeechRecognitionModule.abort();
    activeOwner = owner;
    const local = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    setOnDevice(local);
    ExpoSpeechRecognitionModule.start({
      lang: "es-AR",
      interimResults: true,
      continuous,
      addsPunctuation: true,
      requiresOnDeviceRecognition: local,
      contextualStrings: contextualStrings.slice(0, 100),
    });
    return true;
  }, [contextualStrings, continuous, owner]);

  const stop = useCallback(() => {
    if (activeOwner === owner) ExpoSpeechRecognitionModule.stop();
  }, [owner]);

  const reset = useCallback((text = "") => {
    finalRef.current = text;
    setFinalText(text);
    setPartial("");
  }, []);

  return { available, listening, text: [finalText, partial].filter(Boolean).join(" "), finalText, error, onDevice, start, stop, reset };
}
