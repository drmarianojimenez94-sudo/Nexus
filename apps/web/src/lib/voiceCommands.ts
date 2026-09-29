import type { Event, Memory, Task } from "@nexus/shared";
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
  { patterns: /\bmemoria\b/i, path: "/memory", label: "tu memoria" },
];

const CLOSE_PATTERN = /\b(listo|gracias|cerrar|terminar|chau|nada más|nada mas)\b/i;
// Anchored to an explicit "today"/"pending" framing — bare "qué tengo" alone
// used to match ANY sentence containing that extremely common phrase (e.g.
// "anotá en el calendario que tengo turno mañana"), hijacking navigation to
// /today before the NAV_COMMANDS check below ever saw the word "calendario".
const TODAY_PATTERN = /\b(hoy|today|resumen)\b|\bqu[eé] tengo (hoy|para hoy|pendiente|ahora)\b/i;
const HELP_PATTERN = /\b(ayuda|qu[eé] pod[eé]s hacer|qu[eé] hac[eé]s)\b/i;

/** "Recordá que mi hijo se llama Tomás" → guarda el contenido en Memory (spec §6). */
const REMEMBER_PATTERN = /\b(?:record[aá]|acord[aá]te|no te olvides)\s+que\s+(.+)/i;
/** "Qué sabés/recordás sobre X" → busca en Memory y lo dice en voz alta. */
const RECALL_PATTERN = /\bqu[eé]\s+(?:sab[eé]s|record[aá]s)\s+(?:sobre|de)\s+(.+)/i;

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
        'Podés decir "qué tengo hoy", "abrí el inbox", "abrí el calendario", "abrí proyectos", "abrí áreas" o ' +
        '"abrí memoria". También "recordá que…" para que guarde algo, o "qué sabés sobre…" para preguntarte lo ' +
        "que ya te dije. Cualquier otra cosa que digas la anoto en tu inbox.",
    };
  }

  const remember = text.match(REMEMBER_PATTERN);
  if (remember?.[1]) {
    try {
      await api.post("/memories", { content: remember[1].trim() });
      return { speak: "Listo, lo voy a recordar." };
    } catch {
      return { speak: "No pude guardarlo en tu memoria. Probá de nuevo." };
    }
  }

  const recall = text.match(RECALL_PATTERN);
  if (recall?.[1]) {
    try {
      const { memories } = await api.get<{ memories: Memory[] }>(
        `/memories?q=${encodeURIComponent(recall[1].trim())}`
      );
      if (memories.length === 0) return { speak: "No tengo nada guardado sobre eso." };
      return { speak: memories.slice(0, 3).map((m) => m.content).join(". ") };
    } catch {
      return { speak: "No pude buscar en tu memoria. Probá de nuevo." };
    }
  }

  // Checked before TODAY_PATTERN on purpose: an explicit section name in the
  // sentence ("anotá en el calendario que...") is a stronger, more specific
  // signal than the loose "what do I have" heuristic below, and should win
  // regardless of what else is in the sentence.
  const nav = NAV_COMMANDS.find((c) => c.patterns.test(text));
  if (nav) {
    return { speak: `Listo, te muestro ${nav.label}.`, navigateTo: nav.path };
  }

  if (TODAY_PATTERN.test(text)) {
    try {
      const summary = await speakTodaySummary();
      return { speak: summary, navigateTo: "/today" };
    } catch {
      return { speak: "No pude leer tu resumen de hoy. Probá de nuevo.", navigateTo: "/today" };
    }
  }

  // Nothing matched a command — treat it as a thought to capture, exactly
  // like typed Quick Capture (spec §11). Always navigate to Inbox afterward
  // so the capture is visibly confirmed instead of vanishing silently —
  // every voice interaction should end up "deploying" a real screen.
  try {
    await api.post("/quick-capture", { rawText: text, source: "VOICE" });
    return { speak: "Listo, lo anoté en tu inbox.", navigateTo: "/inbox" };
  } catch (err) {
    if (err instanceof ApiError) {
      return { speak: "No pude guardarlo. Probá de nuevo." };
    }
    queueCapture(text, "VOICE");
    return { speak: "Sin conexión — lo guardé en el teléfono y lo sincronizo después." };
  }
}
