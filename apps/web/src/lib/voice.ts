"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

/**
 * Capa única de voz de salida: todo lo que Nexus dice pasa por acá.
 * Con voz neural configurada en el servidor (VOICE_PROVIDER + VOICE_API_KEY)
 * reproduce el audio de /voice/tts; si no, usa la voz en español más natural
 * del dispositivo. Un solo canal: una frase nueva corta la anterior.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

export interface VoiceStatus {
  provider: "device" | "google" | "elevenlabs" | "openai";
  configured: boolean;
}

const LANG_ORDER = ["es-ar", "es-419", "es-us", "es-mx", "es-es"];
const QUALITY: Array<[RegExp, number]> = [
  [/natural|neural/i, 4],
  [/premium|enhanced|siri/i, 3],
  [/online|google/i, 2],
];

/** Posición del idioma en la preferencia (menor es mejor); -1 si no es español. */
export function spanishRank(lang: string): number {
  const normalized = lang.replace(/_/g, "-").toLowerCase();
  const exact = LANG_ORDER.indexOf(normalized);
  if (exact >= 0) return exact;
  return normalized === "es" || normalized.startsWith("es-")
    ? LANG_ORDER.length
    : -1;
}

/** Qué tan natural suele sonar una voz según su nombre (0 = voz básica). */
export function voiceQuality(name: string): number {
  return QUALITY.reduce(
    (best, [pattern, score]) => (pattern.test(name) ? Math.max(best, score) : best),
    0,
  );
}

/**
 * Elige la voz en español más natural: primero la calidad (Natural, Neural,
 * Premium, Siri, Google…) y, a igual calidad, el acento más cercano
 * (es-AR > es-419 > es-US > es-MX > es-ES). Respeta la elección manual.
 */
export function pickSpanishVoice<T extends VoiceLike>(
  voices: readonly T[],
  preferredName?: string | null,
): T | null {
  if (preferredName) {
    const chosen = voices.find((v) => v.name === preferredName);
    if (chosen) return chosen;
  }
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const rank = spanishRank(voice.lang);
    if (rank < 0) continue;
    const score = voiceQuality(voice.name) * 10 + (LANG_ORDER.length - rank);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/** Voces en español ordenadas de más a menos natural (para Ajustes). */
export function sortSpanishVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  return voices
    .filter((v) => spanishRank(v.lang) >= 0)
    .map((v, i) => ({
      v,
      i,
      score: voiceQuality(v.name) * 10 + (LANG_ORDER.length - spanishRank(v.lang)),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.v);
}

// ── Preferencias locales (por dispositivo) ───────────────────────────────
const MUTED_KEY = "nexus.voice.muted";
const VOICE_KEY = "nexus.voice.name";
const CHANGE_EVENT = "nexus-voice-settings";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // almacenamiento bloqueado: la preferencia dura hasta recargar
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isVoiceMuted(): boolean {
  return typeof window !== "undefined" && readLocal(MUTED_KEY) === "1";
}
export function setVoiceMuted(muted: boolean) {
  writeLocal(MUTED_KEY, muted ? "1" : null);
  if (muted) stopSpeaking();
}
export function getPreferredVoiceName(): string | null {
  return typeof window === "undefined" ? null : readLocal(VOICE_KEY);
}
export function setPreferredVoiceName(name: string | null) {
  writeLocal(VOICE_KEY, name || null);
}

/** Estado del botón «silenciar voz», sincronizado entre pantallas. */
export function useVoiceMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const sync = () => setMuted(isVoiceMuted());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((next: boolean) => setVoiceMuted(next), []);
  return [muted, update];
}

// ── Voz neural del servidor ──────────────────────────────────────────────
const DEVICE: VoiceStatus = { provider: "device", configured: false };
let statusRequest: Promise<VoiceStatus> | null = null;
let neuralUnavailable = false;

export function getVoiceStatus(refresh = false): Promise<VoiceStatus> {
  if (!statusRequest || refresh) {
    neuralUnavailable = false;
    statusRequest = api.get<VoiceStatus>("/voice/status").catch(() => {
      statusRequest = null;
      return DEVICE;
    });
  }
  return statusRequest;
}

/** Voces del sistema; en Chrome llegan después de «voiceschanged». */
export function loadDeviceVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

// ── Canal de reproducción ────────────────────────────────────────────────
export interface SpeechHandle {
  /** Se resuelve al terminar, al fallar o al cancelarse. */
  done: Promise<void>;
  cancel: () => void;
}

let current: SpeechHandle | null = null;

type Run = {
  cancelled: () => boolean;
  onStop: (stop: () => void) => void;
  onStart?: () => void;
};

/** true si se reprodujo (o se canceló); false para usar la voz del dispositivo. */
async function playNeural(text: string, run: Run): Promise<boolean> {
  if (neuralUnavailable || typeof Audio === "undefined") return false;
  const status = await getVoiceStatus();
  if (!status.configured || run.cancelled()) return run.cancelled();
  let blob: Blob;
  try {
    blob = await api.postBlob("/voice/tts", { text: text.slice(0, 1500) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 501) neuralUnavailable = true;
    return run.cancelled();
  }
  if (run.cancelled()) return true;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      audio.pause();
      URL.revokeObjectURL(url);
      resolve(played);
    };
    const watchdog = setTimeout(() => finish(true), 120_000);
    run.onStop(() => finish(true));
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    audio.play().then(
      () => run.onStart?.(),
      // Reproducción bloqueada (autoplay): se intenta con la voz del sistema.
      () => finish(false),
    );
  });
}

async function playDevice(text: string, run: Run): Promise<void> {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices.length) voices = await loadDeviceVoices();
  if (run.cancelled()) return;
  const voice = pickSpanishVoice(voices, getPreferredVoiceName());
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "es-AR";
  utterance.rate = 1;
  utterance.pitch = 1;
  await new Promise<void>((resolve) => {
    let settled = false;
    // Algunos navegadores nunca envían onend si bloquean el audio: se acota la espera.
    const watchdog = setTimeout(
      () => {
        finish();
        synth.cancel();
      },
      Math.min(60_000, Math.max(8000, text.length * 100)),
    );
    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve();
    }
    run.onStop(() => {
      synth.cancel();
      finish();
    });
    utterance.onstart = () => run.onStart?.();
    utterance.onend = finish;
    utterance.onerror = finish;
    try {
      synth.cancel();
      synth.speak(utterance);
    } catch {
      finish();
    }
  });
}

/** Dice un texto con la mejor voz disponible. Corta cualquier frase anterior. */
export function speak(text: string, options: { onStart?: () => void } = {}): SpeechHandle {
  current?.cancel();
  let cancelled = false;
  let stop: () => void = () => {};
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const settle = () => {
    if (current === handle) current = null;
    resolveDone();
  };
  const handle: SpeechHandle = {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      stop();
      settle();
    },
  };
  current = handle;
  if (typeof window === "undefined" || !text.trim()) {
    settle();
    return handle;
  }
  const run: Run = {
    cancelled: () => cancelled,
    onStop: (fn) => {
      stop = fn;
    },
    onStart: options.onStart,
  };
  void (async () => {
    try {
      const handled = await playNeural(text, run);
      if (!handled && !cancelled) await playDevice(text, run);
    } finally {
      settle();
    }
  })();
  return handle;
}

/** Confirmación breve («Abriendo pacientes»), solo si la voz no está silenciada. */
export function announce(text: string): void {
  if (!isVoiceMuted()) speak(text);
}

export function stopSpeaking() {
  current?.cancel();
}
