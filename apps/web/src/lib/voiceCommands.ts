import type { Event, Task } from "@nexus/shared";
import { api, ApiError } from "./api";
import { queueCapture } from "./offlineQueue";

interface TodayResponse {
  now: Event | null;
  priorities: Task[];
  timeline: Event[];
  attention: string[];
  insight: string | null;
}

export interface VoiceCommandResult {
  speak: string;
  /** Client-side path to navigate to, if any. */
  navigateTo?: string;
  /** True when the utterance means "stop listening" — closes the session. */
  close?: boolean;
}

const NAV_COMMANDS: { patterns: RegExp; path: string; label: string }[] = [
  { patterns: /\b(inbox|bandeja)\b/i, path: "/inbox", label: "tu inbox" },
  { patterns: /\b(calendario|agenda)\b/i, path: "/calendar", label: "tu calendario" },
  { patterns: /\b(proyectos?)\b/i, path: "/projects", label: "tus proyectos" },
  { patterns: /\b(áreas?|areas?)\b/i, path: "/areas", label: "tus áreas" },
];

const CLOSE_PATTERN = /\b(listo|gracias|cerrar|terminar|chau|nada más|nada mas)\b/i;
const TODAY_PATTERN = /\b(hoy|today|resumen|qu[eé] tengo)\b/i;
const HELP_PATTERN = /\b(ayuda|qu[eé] pod[eé]s hacer|qu[eé] hac[eé]s)\b/i;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export async function speakTodaySummary(): Promise<string> {
  const { now, priorities, attention } = await api.get<TodayResponse>("/today");
  const parts: string[] = [];
  parts.push(now ? `Lo próximo es "${now.title}" a las ${formatTime(now.startAt)}.` : "No tenés nada agendado próximamente.");
  if (priorities.length > 0) {
    parts.push(`Tus prioridades: ${priorities.map((t) => t.title).join(", ")}.`);
  }
  if (attention.length > 0) {
    parts.push(`Atención: ${attention.join(". ")}.`);
  }
  return parts.join(" ");
}

/**
 * Rule-based voice command router (Nexus Voice V1). Deliberately not an
 * LLM call: zero latency, zero cost, works with no AI_API_KEY configured
 * at all — the same "never depends on a key being present" principle as
 * the rest of Phase 1. Phase 3 (NexusBrain) is where free-form natural
 * language planning replaces this with real intent detection.
 */
export async function handleVoiceCommand(rawText: string): Promise<VoiceCommandResult> {
  const text = rawText.trim();

  if (CLOSE_PATTERN.test(text)) {
    return { speak: "Listo, te escucho cuando quieras.", close: true };
  }

  if (HELP_PATTERN.test(text)) {
    return {
      speak:
        'Podés decir "qué tengo hoy", "abrí el inbox", "abrí el calendario", "abrí proyectos" o "abrí áreas". ' +
        "Cualquier otra cosa que digas la anoto en tu inbox.",
    };
  }

  if (TODAY_PATTERN.test(text)) {
    try {
      const summary = await speakTodaySummary();
      return { speak: summary, navigateTo: "/today" };
    } catch {
      return { speak: "No pude leer tu resumen de hoy. Probá de nuevo.", navigateTo: "/today" };
    }
  }

  const nav = NAV_COMMANDS.find((c) => c.patterns.test(text));
  if (nav) {
    return { speak: `Listo, te muestro ${nav.label}.`, navigateTo: nav.path };
  }

  // Nothing matched a command — treat it as a thought to capture, exactly
  // like typed Quick Capture (spec §11).
  try {
    await api.post("/quick-capture", { rawText: text, source: "VOICE" });
    return { speak: "Listo, lo anoté." };
  } catch (err) {
    if (err instanceof ApiError) {
      return { speak: "No pude guardarlo. Probá de nuevo." };
    }
    queueCapture(text, "VOICE");
    return { speak: "Sin conexión — lo guardé en el teléfono y lo sincronizo después." };
  }
}
