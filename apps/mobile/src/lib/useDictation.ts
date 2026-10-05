import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionErrorCode } from "expo-speech-recognition";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { getPref, setPref } from "./prefs";
import { stopSpeaking, whenIdle } from "./voice";

/* ───────────── Pausa larga configurable (igual que la web) ───────────── */

/** Pausa (ms) sin hablar tras la cual el dictado se detiene solo. 0 = nunca. */
export const SILENCE_OPTIONS = [
  { ms: 15_000, label: "15 segundos" },
  { ms: 30_000, label: "30 segundos" },
  { ms: 60_000, label: "1 minuto" },
  { ms: 0, label: "Nunca: solo con el botón" },
] as const;
export const DEFAULT_SILENCE_MS = 30_000;
const SILENCE_KEY = "dictation_silence_ms";

let silenceMs = DEFAULT_SILENCE_MS;
const silenceListeners = new Set<() => void>();
const silenceLoaded = getPref(SILENCE_KEY).then((raw) => {
  if (raw !== null && SILENCE_OPTIONS.some((o) => String(o.ms) === raw)) {
    silenceMs = Number(raw);
    silenceListeners.forEach((l) => l());
  }
});

export async function setSilenceMs(ms: number) {
  silenceMs = ms;
  silenceListeners.forEach((l) => l());
  await setPref(SILENCE_KEY, String(ms));
}

/** La pausa elegida (se comparte entre pantallas y se recuerda en el teléfono). */
export function useSilenceMs() {
  return useSyncExternalStore(
    (l) => {
      silenceListeners.add(l);
      return () => silenceListeners.delete(l);
    },
    () => silenceMs,
    () => silenceMs,
  );
}

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

/* ───────────── Dueño del reconocedor ───────────── */

/**
 * El reconocedor es uno solo para toda la app, pero las pestañas quedan
 * montadas y el botón global vive arriba de todas: cada usuario del hook se
 * identifica y solo procesa los eventos de la sesión que él mismo inició.
 * Si otro toma el micrófono, el anterior se entera y se apaga.
 */
let activeOwner: { id: string; preempt: () => void } | null = null;
const mine = (id: string) => activeOwner?.id === id;

/** Cortes del sistema que no son un error para quien dicta: se reanuda. */
const RESTARTABLE = new Set<ExpoSpeechRecognitionErrorCode>(["no-speech", "aborted", "speech-timeout", "network", "client", "busy", "interrupted", "unknown"]);
const ERRORS: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  "not-allowed": "Sin permiso de micrófono: habilitalo en los ajustes del teléfono o escribí con el teclado.",
  "service-not-allowed": "El reconocimiento de voz está desactivado en el teléfono. En iPhone, activá Siri y Dictado.",
  "audio-capture": "No pude acceder al micrófono. Revisá si otra aplicación lo está usando.",
  "language-not-supported": "El teléfono no reconoce español: podés escribir.",
};
/**
 * Reinicios seguidos que fallan enseguida antes de rendirse (evita un bucle
 * si el servicio no anda). Un silencio largo no cuenta: cada sesión dura.
 */
const MAX_FAST_FAILS = 8;
const FAST_FAIL_MS = 3000;

export interface DictationOptions {
  /** Términos del dominio que el reconocedor debe privilegiar (vertical.vocabulary.domainTerms). */
  contextualStrings?: string[];
}

export interface StartOptions {
  /** Se llama con todo lo dictado cuando se detiene solo por una pausa larga. */
  onAutoStop?: (text: string) => void;
  /** Conserva lo ya dictado/escrito y sigue agregando. */
  keep?: boolean;
}

/**
 * Dictado continuo nativo (expo-speech-recognition). Escucha hasta que la
 * persona toca «Listo» o hasta una pausa larga real (configurable). iOS y
 * Android cortan el reconocimiento solos tras un silencio corto o al minuto
 * de hablar: acá se reanuda automáticamente sin perder lo dicho, así
 * respirar o pensar no corta el dictado. En el dispositivo cuando el sistema
 * lo soporta, y sin guardar audio. Requiere un development build.
 */
export function useDictation({ contextualStrings = [] }: DictationOptions = {}) {
  const owner = useId();
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);
  /** El micrófono se cortó solo (no lo detuvo la persona): lo dictado se conserva. */
  const [interrupted, setInterrupted] = useState(false);
  /** Lo dictado ya se entregó o descartó: el próximo dictado empieza vacío. */
  const consumed = useRef(true);

  const parts = useRef<string[]>([]);
  const pending = useRef("");
  const wanted = useRef(false);
  const running = useRef(false);
  const local = useRef(false);
  const fastFails = useRef(0);
  const launchedAt = useRef(0);
  const lastSpeech = useRef(0);
  const silenceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoStop = useRef<((text: string) => void) | null>(null);
  const endWaiters = useRef<(() => void)[]>([]);
  const terms = useRef(contextualStrings);
  terms.current = contextualStrings;

  const clearTimers = () => {
    if (silenceTimer.current) clearInterval(silenceTimer.current);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    silenceTimer.current = null;
    restartTimer.current = null;
  };

  /** Lo reconocido a medias pasa a definitivo (el sistema cortó antes del resultado final). */
  const commitPending = () => {
    if (pending.current.trim()) {
      parts.current.push(pending.current);
      setFinalText(joinTranscript(parts.current));
    }
    pending.current = "";
    setPartial("");
  };

  const release = () => {
    if (mine(owner)) activeOwner = null;
    running.current = false;
    setListening(false);
    const waiters = endWaiters.current;
    endWaiters.current = [];
    waiters.forEach((w) => w());
  };

  const launch = useCallback(() => {
    if (!wanted.current || !mine(owner)) return;
    launchedAt.current = Date.now();
    ExpoSpeechRecognitionModule.start({
      lang: "es-AR",
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: local.current,
      contextualStrings: terms.current.slice(0, 100),
      // Android sin modo continuo (12 o anterior): que espere más antes de cortar.
      androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10_000, EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 10_000 },
    });
  }, [owner]);

  const scheduleRestart = useCallback(
    (delay: number) => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
      restartTimer.current = setTimeout(() => {
        restartTimer.current = null;
        if (!wanted.current || running.current) return;
        fastFails.current = Date.now() - launchedAt.current < FAST_FAIL_MS ? fastFails.current + 1 : 0;
        if (fastFails.current > MAX_FAST_FAILS) {
          wanted.current = false;
          clearTimers();
          release();
          setInterrupted(true);
          setError("El micrófono se cortó. Lo que dijiste está guardado: tocá «Seguir dictando» o «Listo».");
          return;
        }
        launch();
      }, delay);
    },
    [launch],
  );

  useSpeechRecognitionEvent("start", () => {
    if (!mine(owner)) return;
    running.current = true;
    setListening(true);
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!mine(owner)) return;
    const text = event.results[0]?.transcript ?? "";
    lastSpeech.current = Date.now();
    if (text.trim()) fastFails.current = 0;
    if (event.isFinal) {
      // En modo continuo cada resultado final es un fragmento nuevo.
      if (text.trim()) parts.current.push(text);
      pending.current = "";
      setFinalText(joinTranscript(parts.current));
      setPartial("");
    } else {
      pending.current = text;
      setPartial(text);
    }
  });
  useSpeechRecognitionEvent("end", () => {
    if (!mine(owner)) return;
    running.current = false;
    commitPending();
    // El sistema cortó solo (silencio o límite de tiempo): seguimos escuchando.
    if (wanted.current) scheduleRestart(250);
    else release();
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!mine(owner)) return;
    if (event.error === "language-not-supported" && local.current && wanted.current) {
      // El español no está instalado para reconocer sin red: se usa el servicio del sistema.
      local.current = false;
      setOnDevice(false);
      running.current = false;
      scheduleRestart(300);
      return;
    }
    if (RESTARTABLE.has(event.error)) {
      // Por si el sistema no emite «end» después del error.
      if (wanted.current) scheduleRestart(event.error === "busy" ? 1200 : 700);
      return;
    }
    wanted.current = false;
    clearTimers();
    commitPending();
    release();
    setInterrupted(true);
    setError(ERRORS[event.error] ?? (event.message || "El micrófono se cortó. Lo que dijiste está guardado: tocá «Seguir dictando» o «Listo»."));
  });

  const available = (() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  })();

  const reset = useCallback((text = "") => {
    consumed.current = true;
    setInterrupted(false);
    parts.current = text ? [text] : [];
    pending.current = "";
    setFinalText(text);
    setPartial("");
  }, []);

  /** Apaga el micrófono sin avisar (otro tomó el reconocedor o la pantalla se fue). */
  const preempt = useCallback(() => {
    wanted.current = false;
    clearTimers();
    commitPending();
    running.current = false;
    setListening(false);
    const waiters = endWaiters.current;
    endWaiters.current = [];
    waiters.forEach((w) => w());
  }, []);

  const start = useCallback(
    async (options: StartOptions = {}) => {
      setError(null);
      if (!available) {
        setError("El dictado no está disponible en este dispositivo: podés escribir.");
        return false;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Sin permiso de micrófono: habilitalo en los ajustes del teléfono o escribí con el teclado.");
        return false;
      }
      // Que Nexus no se escuche a sí mismo.
      stopSpeaking();
      await whenIdle();
      await silenceLoaded;
      if (activeOwner) {
        // Otro (u otra sesión nuestra) tenía el micrófono: se corta y se deja
        // pasar su «end» sin dueño, para que no se confunda con el nuestro.
        const previous = activeOwner;
        activeOwner = null;
        if (previous.id !== owner) previous.preempt();
        ExpoSpeechRecognitionModule.abort();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      activeOwner = { id: owner, preempt };
      // Si el micrófono se había cortado solo, se sigue sumando a lo ya dictado.
      if (!options.keep && consumed.current) reset();
      consumed.current = false;
      setInterrupted(false);
      onAutoStop.current = options.onAutoStop ?? null;
      wanted.current = true;
      running.current = false;
      fastFails.current = 0;
      lastSpeech.current = Date.now();
      clearTimers();
      if (silenceMs > 0) {
        const limit = silenceMs;
        silenceTimer.current = setInterval(() => {
          if (!wanted.current || Date.now() - lastSpeech.current <= limit) return;
          void stopRef.current().then((text) => onAutoStop.current?.(text));
        }, 1000);
      }
      try {
        local.current = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      } catch {
        local.current = false;
      }
      setOnDevice(local.current);
      setListening(true);
      launch();
      return true;
    },
    [available, launch, owner, preempt, reset],
  );

  /** Detiene (tras el último fragmento) y devuelve todo lo dictado. */
  const stop = useCallback(async (): Promise<string> => {
    wanted.current = false;
    clearTimers();
    if (mine(owner) && running.current) {
      await new Promise<void>((resolve) => {
        const guard = setTimeout(resolve, 2000);
        endWaiters.current.push(() => {
          clearTimeout(guard);
          resolve();
        });
        // stop() (no abort) entrega el último fragmento pendiente.
        ExpoSpeechRecognitionModule.stop();
      });
    }
    commitPending();
    release();
    consumed.current = true;
    setInterrupted(false);
    return joinTranscript(parts.current);
  }, [owner]);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  /** Descarta lo dictado y suelta el micrófono. */
  const cancel = useCallback(() => {
    wanted.current = false;
    clearTimers();
    if (mine(owner)) ExpoSpeechRecognitionModule.abort();
    release();
    reset();
  }, [owner, reset]);

  // Al desmontar, soltar el micrófono si era nuestro.
  useEffect(
    () => () => {
      wanted.current = false;
      clearTimers();
      if (mine(owner)) {
        activeOwner = null;
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [owner],
  );

  return {
    available,
    listening,
    /** Todo lo dictado hasta ahora, incluido lo que se está reconociendo. */
    text: joinTranscript([finalText, partial]),
    finalText,
    error,
    interrupted,
    onDevice,
    start,
    stop,
    cancel,
    reset,
  };
}
