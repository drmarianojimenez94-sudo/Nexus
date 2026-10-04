import type { Event, Memory, Task } from "@nexus/shared";
import { api, ApiError } from "./api";
import { queueCapture } from "./offlineQueue";
import { looksSensitive, medicineVertical } from "@nexus/verticals";
import { CLINICAL_HANDOFF_KEY } from "./clinicalCapture";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface TodayResponse {
  now: Event | null;
  priorities: Task[];
  timeline: Event[];
  attention: string[];
  insight: string | null;
}

export interface AlarmAction {
  at: string;
  title: string;
}
export interface EventAction {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  /** También quedó en Google Calendar. */
  google: boolean;
}
export interface EmailDraftAction {
  to: string;
  subject: string;
  body: string;
  /** Presentes solo si quedó como borrador en Gmail y puede enviarse con confirmación. */
  id?: string;
  confirmationToken?: string;
  connected: boolean;
  note?: string;
}

export interface VoiceCommandResult {
  speak: string;
  /** Client-side path to navigate to, if any. */
  navigateTo?: string;
  /** True when the utterance means "stop listening" — closes the session. */
  close?: boolean;
  alarm?: AlarmAction;
  event?: EventAction;
  emailDraft?: EmailDraftAction;
}

// Full utterance matching prevents "abrí el calendario y agendá..." losing its action.
// Patterns run on normalized text (lowercase, no accents), after removing a
// leading verb ("abrí", "mostrame", "ir a"…) and articles ("el", "mis"…).
export const NAV_COMMANDS: Array<{ patterns: RegExp; path: string; say: string }> = [
  {
    patterns:
      /^(?:(?:crear|crea|agregar|agrega|dar de alta|alta de)\s+(?:(?:un|una|el|la)\s+)?)?(?:nuevo paciente|paciente nuevo|nueva ficha|ficha nueva)$/,
    path: "/patients/new",
    say: "Abriendo una ficha nueva",
  },
  {
    patterns:
      /^(?:(?:cargar|carga|cargame|dictar|dicta|dictame|anotar|registrar|registra|nueva|nuevo)\s+(?:(?:un|una|el|la)\s+)?(?:paciente|consulta|atencion|evolucion)|dictado(?: clinico)?|asistente clinico)$/,
    path: "/patients/capture",
    say: "Abriendo el dictado clínico",
  },
  {
    patterns:
      /^(?:dia(?: medico| de consultorio| de hoy en el consultorio)?|agenda medica|consultorio de hoy)$/,
    path: "/patients/day",
    say: "Abriendo tu día médico",
  },
  {
    patterns: /^(?:seguimientos?|controles pendientes|pendientes de pacientes)$/,
    path: "/patients/followups",
    say: "Abriendo seguimientos",
  },
  {
    patterns:
      /^(?:pacientes|paciente|consultorio|historias clinicas|historia clinica|fichas|lista de pacientes|parte medica|medicina)$/,
    path: "/patients",
    say: "Abriendo pacientes",
  },
  {
    patterns: /^(?:mails?|e-?mails?|correos?(?: electronico)?|gmail|bandeja de correo)$/,
    path: "/settings#google",
    say: "Abriendo tu correo",
  },
  {
    patterns: /^(?:inbox|bandeja(?: de entrada)?)$/,
    path: "/inbox",
    say: "Abriendo tu inbox",
  },
  {
    patterns: /^(?:calendario|agenda|turnos)$/,
    path: "/calendar",
    say: "Abriendo calendario",
  },
  { patterns: /^proyectos?$/, path: "/projects", say: "Abriendo proyectos" },
  { patterns: /^areas?$/, path: "/areas", say: "Abriendo tus áreas" },
  { patterns: /^memoria$/, path: "/memory", say: "Abriendo tu memoria" },
  {
    patterns: /^(?:ajustes|configuracion|preferencias)$/,
    path: "/settings",
    say: "Abriendo ajustes",
  },
  {
    patterns: /^(?:hoy|inicio|panel)$/,
    path: "/today",
    say: "Abriendo tu panel de hoy",
  },
];

const NAV_VERB =
  /^(?:(?:abri(?:me)?|abrir|abre(?:me)?|mostra(?:me)?|mostrar|muestra(?:me)?|llevame a|lleva(?:me)? al|ir a|ir al|anda a|anda al|vamos a|vamos al|entrar a|entra a|ver|quiero ver|quiero ir a|quiero que (?:me )?abras|quiero|necesito)\s+)/;
const NAV_ARTICLE = /^(?:(?:el|la|los|las|mi|mis|un|una|al|a|del)\s+)+/;

/** Normalized nav target, or undefined when the utterance is more than navigation. */
export function navigationCommand(text: string) {
  let rest = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(?:hola,? )?nexus[, ]+/, "")
    .replace(/[.!?¡¿]+/g, "")
    .replace(/^por favor,? /, "")
    .replace(/,? por favor$/, "")
    .replace(/\s+/g, " ")
    .trim();
  rest = rest.replace(NAV_VERB, "").replace(NAV_ARTICLE, "").trim();
  return NAV_COMMANDS.find((command) => command.patterns.test(rest));
}

const CLINICAL_DICTATION =
  /^(?:nexus[, ]+)?(?:dict[aá](?:r|me)?|carg[aá](?:r|me)?|registr[aá]r?)\s+(?:(?:un|una|el|la)\s+)?(?:paciente|consulta)\b/i;

const CLOSE_PATTERN =
  /^(?:(?:nexus)[, ]+)?(?:listo|gracias|cerrar|terminar|chau|nada m[aá]s|hasta luego)[.!?]*$/i;
// Anchored to an explicit "today"/"pending" framing — bare "qué tengo" alone
// used to match ANY sentence containing that extremely common phrase (e.g.
// "anotá en el calendario que tengo turno mañana"), hijacking navigation to
// /today before the NAV_COMMANDS check below ever saw the word "calendario".
const TODAY_PATTERN =
  /^(?:nexus[, ]+)?(?:qu[eé] tengo (?:hoy|para hoy|pendiente|ahora)|(?:mostrame|dame|leeme|leer) (?:mi |el )?resumen(?: de hoy)?|resumen|hoy|today)[.!?]*$/i;
const HELP_PATTERN =
  /^(?:nexus[, ]+)?(?:ayuda|qu[eé] pod[eé]s hacer|qu[eé] hac[eé]s)[.!?]*$/i;

/** "Recordá que mi hijo se llama Tomás" → guarda el contenido en Memory (spec §6). */
const REMEMBER_PATTERN =
  /\b(?:record[aá]|acord[aá]te|no te olvides)\s+que\s+(.+)/i;
/** "Qué sabés/recordás sobre X" → busca en Memory y lo dice en voz alta. */
const RECALL_PATTERN =
  /\bqu[eé]\s+(?:sab[eé]s|record[aá]s)\s+(?:sobre|de)\s+(.+)/i;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function speakTodaySummary(): Promise<string> {
  const { now, priorities, attention } = await api.get<TodayResponse>("/today");
  const parts: string[] = [];
  parts.push(
    now
      ? `Lo próximo es "${now.title}" a las ${formatTime(now.startAt)}.`
      : "No tenés nada agendado próximamente.",
  );
  if (priorities.length > 0) {
    parts.push(
      `Tus prioridades: ${priorities.map((t) => t.title).join(", ")}.`,
    );
  }
  if (attention.length > 0) {
    parts.push(`Atención: ${attention.join(". ")}.`);
  }
  return parts.join(" ");
}

interface InterpretResponse {
  speak: string;
  navigateTo?: string;
  target?: string;
  alarm?: AlarmAction;
  event?: EventAction;
  emailDraft?: EmailDraftAction;
  /** Datos de pacientes: se derivan al asistente clínico, nunca al inbox. */
  handoff?: { vertical: string; text: string };
}

const CLINICAL_CAPTURE_PATH = "/patients/capture";

/**
 * Lleva el texto al asistente clínico para revisarlo allí: nada se guarda
 * hasta que el profesional confirme. Si el dispositivo no permite conservarlo,
 * igual abre la pantalla y pide repetirlo, sin escribirlo en otro lado.
 */
function clinicalHandoff(
  text: string,
  speak = "Eso parece información de un paciente. Te llevo al asistente clínico para revisarla antes de guardar.",
  navigateTo = CLINICAL_CAPTURE_PATH,
): VoiceCommandResult {
  try {
    sessionStorage.setItem(CLINICAL_HANDOFF_KEY, text);
  } catch {
    return {
      speak:
        "Eso parece información de un paciente. Abrí el asistente clínico y dictalo allí; no pude conservar el texto en el dispositivo.",
      navigateTo,
    };
  }
  return { speak, navigateTo };
}

/**
 * NexusBrain (spec Fase 3): real understanding via NexusAIProvider —
 * "anotame en el calendario que tengo turno el martes" comes back as an
 * actual calendar event, not a page navigation. Server-side only (needs
 * AI_API_KEY, which the client must never see). Returns null only when NEXUS
 * has no AI configured (501), so the
 * caller can fall through to the always-available rule-based router —
 * this is an enhancement, never a hard dependency.
 */
async function tryBrain(
  text: string,
  history: ConversationTurn[],
): Promise<VoiceCommandResult | null> {
  try {
    const result = await api.post<InterpretResponse>("/assistant/interpret", {
      text,
      history,
    });
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
    if (result.handoff?.text)
      return clinicalHandoff(
        result.handoff.text,
        result.speak,
        result.navigateTo ?? CLINICAL_CAPTURE_PATH,
      );
    const out: VoiceCommandResult = { speak: result.speak };
    if (result.navigateTo) out.navigateTo = result.navigateTo;
    if (result.alarm) out.alarm = result.alarm;
    if (result.event) out.event = result.event;
    if (result.emailDraft) out.emailDraft = result.emailDraft;
    return out;
  } catch (err) {
    if (err instanceof ApiError && err.status === 501) return null;
    throw err;
  }
}

/**
 * Voice command router (Nexus Voice V1/V1.5). CLOSE/HELP/REMEMBER/RECALL/
 * TODAY/NAVIGATION stay rule-based on purpose — zero latency, zero cost, unambiguous
 * phrasing, work with no AI_API_KEY at all. Everything else tries
 * NexusBrain first (real understanding, not keyword matching) when AI is
 * configured, falling back to explicit note capture
 * when it isn't — so NEXUS is smarter with a key and still fully
 * functional without one.
 */
export async function handleVoiceCommand(
  rawText: string,
  history: ConversationTurn[] = [],
  userId?: string,
): Promise<VoiceCommandResult> {
  const text = rawText.trim();

  if (CLOSE_PATTERN.test(text)) {
    return { speak: "Listo, te escucho cuando quieras.", close: true };
  }

  if (HELP_PATTERN.test(text)) {
    return {
      speak:
        'Podés decir "abrí pacientes", "dictar paciente", "mi día médico", "seguimientos", "qué tengo hoy", ' +
        '"abrí el calendario", "abrí el correo", "abrí proyectos" o "abrí memoria". También "recordá que…" para que guarde algo, o "qué sabés sobre…" para preguntarte lo ' +
        "que ya te dije. Cualquier otra cosa la interpreto — pedime que agende algo, ponga una alarma, " +
        "redacte un mail o te avise en un momento cuando la IA esté conectada. Para configurar la IA, decime ‘abrí ajustes’.",
    };
  }

  const remember = text.match(REMEMBER_PATTERN);
  // La memoria personal tampoco es lugar para datos de pacientes.
  if (remember?.[1] && looksSensitive(text, medicineVertical))
    return clinicalHandoff(text);
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
        `/memories?q=${encodeURIComponent(recall[1].trim())}`,
      );
      if (memories.length === 0)
        return { speak: "No tengo nada guardado sobre eso." };
      return {
        speak: memories
          .slice(0, 3)
          .map((m) => m.content)
          .join(". "),
      };
    } catch {
      return { speak: "No pude buscar en tu memoria. Probá de nuevo." };
    }
  }

  if (TODAY_PATTERN.test(text)) {
    try {
      const summary = await speakTodaySummary();
      return { speak: summary, navigateTo: "/today" };
    } catch {
      return {
        speak: "No pude leer tu resumen de hoy. Probá de nuevo.",
        navigateTo: "/today",
      };
    }
  }

  if (
    /^(?:(?:quiero|vamos a)\s+)?(?:crear|armar|desglosar|planificar|explicar)\s+(?:un|el|mi)?\s*proyecto\b/i.test(
      text,
    )
  ) {
    try {
      sessionStorage.setItem("nexus_project_brief", text);
    } catch {
      return {
        speak:
          "Abrí Proyectos y dictá allí la explicación; no pude conservar este texto en el dispositivo.",
        navigateTo: "/projects",
      };
    }
    return {
      speak:
        "Te llevo a Proyectos para revisar el nombre, la descripción y los pendientes antes de guardar.",
      navigateTo: "/projects",
    };
  }
  // Navigation must work immediately even if the AI is unavailable or misconfigured.
  const nav = navigationCommand(text);
  if (nav) return { speak: `${nav.say}.`, navigateTo: nav.path };

  // "Dictá paciente Ana Gómez, tos de tres días…": intención clínica explícita.
  // Va directo al asistente clínico, sin pasar por la IA general.
  if (CLINICAL_DICTATION.test(text))
    return clinicalHandoff(
      text,
      "Abriendo el dictado clínico. Revisá lo que entendí antes de guardar.",
    );

  try {
    const brainResult = await tryBrain(text, history);
    if (brainResult) return brainResult;
  } catch (err) {
    // Sin respuesta del servidor (sin conexión): nada se escribió, así que
    // los datos de pacientes pueden derivarse al asistente clínico.
    if (!(err instanceof ApiError) && looksSensitive(text, medicineVertical))
      return clinicalHandoff(text);
    // A failed response can follow a successful write. Never execute a second fallback write.
    return {
      speak:
        "No pude confirmar la respuesta de la IA. Revisá tu panel antes de repetir una acción.",
    };
  }

  // Datos de pacientes nunca van al inbox ni a la cola offline sin cifrar,
  // aunque la IA no esté configurada.
  if (looksSensitive(text, medicineVertical)) return clinicalHandoff(text);

  if (
    !/^(?:anot[aá](?:me)?|guard[aá](?:me)?|nota|captur[aá]|tengo que|record[aá](?:me)?|avis[aá](?:me)?|agend[aá](?:me)?)(?=\s|$)/i.test(
      text,
    )
  ) {
    return {
      speak:
        "La conversación con IA todavía no está configurada. Puedo leer tu resumen, abrir secciones o guardar una nota si me decís ‘anotá’.",
    };
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
    const saved = queueCapture(text, "VOICE", userId);
    return {
      speak: saved
        ? "Sin conexión — lo guardé en el teléfono y lo sincronizo después."
        : "No pude guardar en el dispositivo. Conservá el texto y reintentá cuando haya conexión.",
    };
  }
}
