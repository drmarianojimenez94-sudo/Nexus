import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { api } from "./api";
import { getPref, setPref } from "./prefs";

/**
 * Capa de voz de salida, única para toda la app (las pestañas comparten
 * estado: lo que dice Inicio sigue sonando al cambiar de pantalla, y el
 * dictado espera a que termine antes de abrir el micrófono).
 *
 * 1. Si el servidor tiene voz neural (`GET /voice/status` → configured),
 *    pide el MP3 a `POST /voice/tts`, lo escribe en el caché y lo reproduce
 *    con expo-audio.
 * 2. Si no, o si falla, usa expo-speech con la mejor voz en español del
 *    teléfono (calidad Enhanced/Premium primero; es-AR > es-419 > es-US >
 *    es-MX > es-ES).
 */

interface VoiceState {
  speaking: boolean;
  muted: boolean;
  provider: "neural" | "device" | null;
}

let state: VoiceState = { speaking: false, muted: false, provider: null };
const listeners = new Set<() => void>();
const idleWaiters = new Set<() => void>();

function update(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (!state.speaking) {
    idleWaiters.forEach((w) => w());
    idleWaiters.clear();
  }
}

const MUTE_KEY = "voice_muted";
let mutedLoaded: Promise<void> | null = null;
function loadMuted() {
  mutedLoaded ??= getPref(MUTE_KEY).then((v) => update({ muted: v === "1" }));
  return mutedLoaded;
}
void loadMuted();

let neural: Promise<boolean> | null = null;
function neuralAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(false);
  neural ??= api
    .get<{ provider: string; configured: boolean }>("/voice/status")
    .then((s) => s.configured)
    .catch(() => {
      neural = null; // reintentar en la próxima frase (p. ej. sin red o sin sesión)
      return false;
    });
  return neural;
}

const LOCALE_RANK: Record<string, number> = { "es-ar": 5, "es-419": 4, "es-us": 3, "es-mx": 2, "es-es": 1 };
const QUALITY_RANK: Record<string, number> = { premium: 2, enhanced: 1 };

let bestVoice: Promise<Speech.Voice | null> | null = null;
function pickVoice(): Promise<Speech.Voice | null> {
  bestVoice ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const scored = voices
        .filter((v) => v.language.toLowerCase().startsWith("es"))
        .map((v) => {
          const lang = v.language.toLowerCase().replace("_", "-");
          const quality = QUALITY_RANK[String(v.quality).toLowerCase()] ?? 0;
          return { v, score: quality * 6 + (LOCALE_RANK[lang] ?? 0) };
        })
        .sort((a, b) => b.score - a.score);
      return scored[0]?.v ?? null;
    })
    .catch(() => null);
  return bestVoice;
}

let player: AudioPlayer | null = null;
let audioModeSet = false;
let generation = 0;

function releasePlayer() {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // ya liberado
  }
  player = null;
}

async function playNeural(text: string, gen: number): Promise<boolean> {
  let file: File | null = null;
  try {
    const bytes = await api.postBinary("/voice/tts", { text: text.slice(0, 1500) });
    if (gen !== generation) return true;
    file = new File(Paths.cache, `nexus-voz-${gen}.mp3`);
    file.write(new Uint8Array(bytes));
    if (!audioModeSet) {
      await setAudioModeAsync({ playsInSilentMode: true });
      audioModeSet = true;
    }
    releasePlayer();
    const current = createAudioPlayer(file.uri);
    player = current;
    await new Promise<void>((resolve) => {
      // Tope de seguridad por si el reproductor nunca informa el final.
      const guard = setTimeout(resolve, Math.max(15_000, text.length * 120));
      const sub = current.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish || gen !== generation) {
          clearTimeout(guard);
          sub.remove();
          resolve();
        }
      });
      current.play();
    });
    if (player === current) releasePlayer();
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (file?.exists) file.delete();
    } catch {
      // el caché lo limpia el sistema
    }
  }
}

async function speakDevice(text: string, gen: number): Promise<void> {
  const voice = await pickVoice();
  if (gen !== generation) return;
  await new Promise<void>((resolve) => {
    Speech.speak(text, {
      language: voice?.language ?? "es-AR",
      voice: voice?.identifier,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

/** Dice el texto (si la voz no está silenciada). Resuelve cuando terminó o se interrumpió. */
export async function speak(text: string): Promise<void> {
  await loadMuted();
  const clean = text.trim();
  if (!clean || state.muted) return;
  stopSpeaking();
  const gen = ++generation;
  update({ speaking: true });
  try {
    const useNeural = await neuralAvailable();
    if (gen !== generation) return;
    if (useNeural && (await playNeural(clean, gen))) {
      update({ provider: "neural" });
      return;
    }
    if (gen !== generation) return;
    update({ provider: "device" });
    await speakDevice(clean, gen);
  } finally {
    if (gen === generation) update({ speaking: false });
  }
}

export function stopSpeaking() {
  generation++;
  releasePlayer();
  void Speech.stop();
  if (state.speaking) update({ speaking: false });
}

/** Resuelve cuando Nexus terminó de hablar (para no abrir el micrófono encima de su propia voz). */
export function whenIdle(): Promise<void> {
  if (!state.speaking) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.add(resolve));
}

export async function setMuted(muted: boolean) {
  if (muted) stopSpeaking();
  update({ muted });
  await setPref(MUTE_KEY, muted ? "1" : "0");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoice() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  return { ...snapshot, speak, stop: stopSpeaking, setMuted };
}
