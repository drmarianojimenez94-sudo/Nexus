import type { Event, Memory, Task } from "@nexus/shared";
import { api, ApiError } from "./api";
import { queueCapture } from "./offlineQueue";

export interface ConversationTurn { role: "user" | "assistant"; content: string }

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

const CLOSE_PATTERN = /^(?:(?:nexus)[, ]+)?(?:listo|gracias|cerrar|terminar|chau|nada m[aá]s|hasta luego)[.!?]*$/i;
// Anchored to an explicit "today"/"pending" framing — bare "qué tengo" alone
// used to match ANY sentence containing that extremely common phrase (e.g.
// "anotá en el calendario que tengo turno mañana"), hijacking navigation to
// /today before the NAV_COMMANDS check below ever saw the word "calendario".
const TODAY_PATTERN = /^(?:nexus[, ]+)?(?:qu[eé] tengo (?:hoy|para hoy|pendiente|ahora)|(?:mostrame|dame|leeme|leer) (?:mi |el )?resumen(?: de hoy)?|resumen|hoy|today)[.!?]*$/i;
const HELP_PATTERN = /^(?:nexus[, ]+)?(?:ayuda|qu[eé] pod[eé]s hacer|qu[eé] hac[eé]s)[.!?]*$/i;

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

interface InterpretResponse {
  speak: string;
  navigateTo?: string;
  target?: "today" | "inbox" | "calendar" | "projects" | "areas" | "memory";
}

/**
 * NexusBrain (spec Fase 3): real understanding via NexusAIProvider —
 * "anotame en el calendario que tengo turno el martes" comes back as an
 * actual calendar event, not a page navigation. Server-side only (needs
 * AI_API_KEY, which the client must never see). Returns null when NEXUS
 * has no AI configured (501) or the call fails for any reason, so the
 * caller can fall through to the always-available rule-based router —
 * this is an enhancement, never a hard dependency.
 */
async function tryBrain(text: string, history: ConversationTurn[]): Promise<VoiceCommandResult | null> {
  try {
    const result = await api.post<InterpretResponse>("/assistant/interpret", { text, history });
    if (result.target === "today") {
      // The brain's spokenReply is a generic transition line; Today has a
      // richer, already-working spoken summary with live NOW/priorities/
      // attention data — use that instead for this one case.
      try {
        return { speak: await speakTodaySummary(), navigateTo: "/today" };
      } catch {
        return { speak: result.speak, navigateTo: result.navigateTo };
      }
    }
    return { speak: result.speak, navigateTo: result.navigateTo };
  } catch (err) {
    if (err instanceof ApiError && err.status === 501) return null;
    throw err;
  }
}

/**
 * Voice command router (Nexus Voice V1/V1.5). CLOSE/HELP/REMEMBER/RECALL/
 * TODAY stay rule-based on purpose — zero latency, zero cost, unambiguous
 * phrasing, work with no AI_API_KEY at all. Everything else tries
 * NexusBrain first (real understanding, not keyword matching) when AI is
 * configured, falling back to the old rule-based nav-or-capture chain
 * when it isn't — so NEXUS is smarter with a key and still fully
 * functional without one.
 */
export async function handleVoiceCommand(rawText: string, history: ConversationTurn[] = []): Promise<VoiceCommandResult> {
  const text = rawText.trim();

  if (CLOSE_PATTERN.test(text)) {
    return { speak: "Listo, te escucho cuando quieras.", close: true };
  }

  if (HELP_PATTERN.test(text)) {
    return {
      speak:
        'Podés decir "qué tengo hoy", "abrí el inbox", "abrí el calendario", "abrí proyectos", "abrí áreas" o ' +
        '"abrí memoria". También "recordá que…" para que guarde algo, o "qué sabés sobre…" para preguntarte lo ' +
        "que ya te dije. Cualquier otra cosa la interpreto — pedime que agende algo, cree una tarea o te avise " +
        "en un momento y lo hago de verdad.",
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

  if (TODAY_PATTERN.test(text)) {
    try {
      const summary = await speakTodaySummary();
      return { speak: summary, navigateTo: "/today" };
    } catch {
      return { speak: "No pude leer tu resumen de hoy. Probá de nuevo.", navigateTo: "/today" };
    }
  }

  try {
    const brainResult = await tryBrain(text, history);
    if (brainResult) return brainResult;
  } catch {
    // A failed response can follow a successful write. Never execute a second fallback write.
    return { speak: "No pude confirmar la respuesta de la IA. Revisá tu panel antes de repetir una acción." };
  }

  // No AI configured, or the brain call failed — same rule-based fallback
  // as before, so voice never goes silent just because a key is missing.
  const nav = /^(?:abr[ií]|abrir|mostrame|mostrar|llevame a|ver)\s/i.test(text) ? NAV_COMMANDS.find((c) => c.patterns.test(text)) : undefined;
  if (nav) {
    return { speak: `Listo, te muestro ${nav.label}.`, navigateTo: nav.path };
  }

  if (!/^(?:anot[aá](?:me)?|guard[aá](?:me)?|nota|captur[aá]|tengo que|record[aá](?:me)?|avis[aá](?:me)?|agend[aá](?:me)?)(?=\s|$)/i.test(text)) {
    return { speak: "La conversación con IA todavía no está configurada. Puedo leer tu resumen, abrir secciones o guardar una nota si me decís ‘anotá’." };
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
