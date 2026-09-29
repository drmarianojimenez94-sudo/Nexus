import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

/**
 * NexusAIProvider (spec §42): every AI-backed feature goes through this
 * interface, never a vendor SDK directly, so NEXUS is never locked to one
 * provider. Today's only implementation wraps Anthropic; Phase 3
 * (NexusBrain) adds the rest of this interface (parseNaturalLanguage,
 * planActions, etc.) on top of the same client.
 */
export interface NexusAIProvider {
  generateDailyInsight(context: DailyInsightContext): Promise<string | null>;
  interpretUtterance(text: string, context: UtteranceContext): Promise<ParsedIntent | null>;
}

export interface UtteranceContext {
  userName: string;
  /** Server "now" in the phrase's own timezone assumption — the model resolves "mañana"/"el martes" against this. */
  now: Date;
}

export type IntentKind = "create_event" | "create_task" | "create_reminder" | "remember" | "navigate" | "note";

export type NavigateTarget = "today" | "inbox" | "calendar" | "projects" | "areas" | "memory";

export interface ParsedIntent {
  intent: IntentKind;
  /** Title/content for whichever entity `intent` creates. Ignored for navigate. */
  title: string;
  /** ISO datetime — required for create_event/create_reminder, ignored otherwise. */
  when: string | null;
  /** Only for intent "navigate". */
  target: NavigateTarget | null;
  /** What NEXUS should say back, already phrased as a confirmation in Spanish. */
  spokenReply: string;
}

export interface DailyInsightContext {
  userName: string;
  overdueTaskCount: number;
  openTaskTitles: string[];
  upcomingDeadlines: { title: string; dueInHours: number }[];
  eventsToday: number;
  /** Freeform memories (spec §6) the user asked NEXUS to remember, most recent first. */
  recentMemories: string[];
  /** Morning Brief vs. Evening Review framing (spec Fase 6) — same call, different lens. */
  timeOfDay: "morning" | "afternoon" | "evening";
}

const client = env.aiApiKey ? new Anthropic({ apiKey: env.aiApiKey }) : null;

class AnthropicProvider implements NexusAIProvider {
  async generateDailyInsight(context: DailyInsightContext): Promise<string | null> {
    if (!client) return null;

    const prompt = buildInsightPrompt(context);
    try {
      const response = await client.messages.create(
        {
          model: env.aiModel,
          max_tokens: 120,
          system:
            "Sos NEXUS, un asistente personal. Generás UNA sola oración breve (máximo 220 caracteres), " +
            "en español rioplatense, tono directo y tranquilo, sin emojis, sin saludos, sin explicar que sos una IA. " +
            "Es una sugerencia u observación útil sobre el día de la persona, basada solo en los datos que te paso. " +
            "Si es de mañana, es un Morning Brief: mirá hacia adelante (qué se viene, qué conviene priorizar). " +
            "Si es de noche, es un Evening Review: mirá hacia atrás (qué quedó pendiente, qué se puede soltar por " +
            "hoy) en vez de listar lo que ya pasó. A la tarde, cualquiera de los dos enfoques sirve. " +
            "Si te paso 'Cosas que recordás sobre esta persona', son datos reales que guardó antes — podés usarlos " +
            "para que la sugerencia se sienta personal (ej. mencionar a alguien por nombre), pero solo si son " +
            "relevantes al día de hoy; ignoralos si no aportan. Nunca inventes tareas, personas o datos que no te di.",
          messages: [{ role: "user", content: prompt }],
        },
        { timeout: 6000 }
      );

      const text = response.content.find((block) => block.type === "text")?.text?.trim();
      return text && text.length > 0 ? text : null;
    } catch (err) {
      // Any failure (no network, bad key, rate limit) falls back to the
      // rule-based insight in the caller — never breaks the Today screen.
      console.error("NexusAIProvider.generateDailyInsight failed:", err);
      return null;
    }
  }

  /**
   * The "cerebro" the user asked for explicitly: instead of the rule-based
   * voice router just recognizing the word "calendario" and navigating
   * there, this actually reads the sentence — "anotame en el calendario
   * que tengo turno el martes a las 10" comes back as a structured
   * create_event with a resolved ISO date, not a page navigation. Uses
   * tool-use with a forced tool_choice so the response is always valid
   * structured data, never free text to parse-and-hope.
   */
  async interpretUtterance(text: string, context: UtteranceContext): Promise<ParsedIntent | null> {
    if (!client) return null;

    const nowIso = context.now.toISOString();
    const weekday = context.now.toLocaleDateString("es-AR", { weekday: "long", timeZone: "America/Argentina/Buenos_Aires" });

    try {
      const response = await client.messages.create(
        {
          model: env.aiModel,
          max_tokens: 400,
          system:
            "Sos el cerebro de NEXUS, un asistente personal. Te paso algo que la persona dijo por voz o texto, y " +
            "tenés que decidir qué acción real representa y devolverla con la tool record_intent — nunca respondas " +
            "en texto libre. Elegí el intent que mejor encaje:\n" +
            "- create_event: algo con fecha/hora que va al calendario (\"anotame un turno el martes a las 10\").\n" +
            "- create_task: algo para hacer, sin horario fijo obligatorio (\"tengo que llamar al banco\").\n" +
            "- create_reminder: pide explícitamente que le avisen/recuerden en un momento (\"avisame mañana a las 9 " +
            "que llame al dentista\", \"recordame en una hora que...\").\n" +
            "- remember: pide que NEXUS recuerde un dato sobre su vida, sin fecha (\"mi hijo se llama Tomás\").\n" +
            "- navigate: solo quiere VER una sección, sin crear nada (\"abrí el calendario\", \"mostrame mis " +
            "proyectos\", \"llevame a memoria\", \"qué tengo hoy\"). target dice cuál: today, inbox, calendar, " +
            "projects, areas o memory.\n" +
            "- note: cualquier otra cosa — un pensamiento suelto, no encaja en lo anterior.\n" +
            "IMPORTANTE: si la frase menciona una sección (calendario, inbox, proyectos, áreas, memoria) PERO " +
            "también pide crear, anotar, agendar o recordar algo con contenido real, NO es navigate — es " +
            "create_event/create_task/create_reminder/remember según corresponda. \"anotame en el calendario que " +
            "tengo turno el martes\" es create_event, no navigate — mencionar el calendario no alcanza, tiene que " +
            "haber algo real para crear.\n" +
            `Fecha y hora actuales: ${nowIso} (${weekday}, zona horaria America/Argentina/Buenos_Aires). Resolvé ` +
            "fechas relativas (\"mañana\", \"el martes\", \"en dos horas\") contra esa fecha y devolvé \"when\" " +
            "como ISO 8601 completo — para create_event/create_reminder es obligatorio; si no hay fecha clara en " +
            "el texto para esos dos intents, usá note en su lugar en vez de inventar una hora. spokenReply es lo " +
            "que NEXUS te contesta en voz alta: una confirmación breve en español rioplatense, tono directo, sin " +
            "emojis, describiendo lo que realmente hizo (nunca digas que hiciste algo que no pediste). title es un " +
            "resumen corto de 3 a 8 palabras de qué se creó o guardó, nunca la frase completa tal cual la dijeron " +
            "— irrelevante para navigate.",
          tools: [
            {
              name: "record_intent",
              description: "Registra la acción interpretada de lo que dijo el usuario.",
              input_schema: {
                type: "object",
                properties: {
                  intent: {
                    type: "string",
                    enum: ["create_event", "create_task", "create_reminder", "remember", "navigate", "note"],
                  },
                  title: { type: "string" },
                  when: { type: ["string", "null"], description: "ISO 8601 datetime, o null si no aplica." },
                  target: {
                    type: ["string", "null"],
                    enum: ["today", "inbox", "calendar", "projects", "areas", "memory", null],
                    description: "Solo para intent navigate.",
                  },
                  spokenReply: { type: "string" },
                },
                required: ["intent", "title", "when", "target", "spokenReply"],
              },
            },
          ],
          tool_choice: { type: "tool", name: "record_intent" },
          messages: [{ role: "user", content: text }],
        },
        { timeout: 8000 }
      );

      const toolUse = response.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") return null;
      const input = toolUse.input as Partial<ParsedIntent>;
      if (!input.intent || !input.spokenReply) return null;

      return {
        intent: input.intent,
        title: input.title ?? "",
        when: input.when ?? null,
        target: input.target ?? null,
        spokenReply: input.spokenReply,
      };
    } catch (err) {
      console.error("NexusAIProvider.interpretUtterance failed:", err);
      return null;
    }
  }
}

const TIME_OF_DAY_LABEL: Record<DailyInsightContext["timeOfDay"], string> = {
  morning: "mañana",
  afternoon: "tarde",
  evening: "noche",
};

function buildInsightPrompt(context: DailyInsightContext): string {
  const lines = [
    `Momento del día: ${TIME_OF_DAY_LABEL[context.timeOfDay]}`,
    `Usuario: ${context.userName}`,
    `Tareas atrasadas: ${context.overdueTaskCount}`,
    `Tareas abiertas: ${context.openTaskTitles.length ? context.openTaskTitles.join("; ") : "ninguna"}`,
    `Eventos hoy: ${context.eventsToday}`,
    context.upcomingDeadlines.length > 0
      ? `Vencen pronto: ${context.upcomingDeadlines.map((d) => `"${d.title}" en ${d.dueInHours}h`).join("; ")}`
      : "Sin deadlines próximos",
  ];
  if (context.recentMemories.length > 0) {
    lines.push(`Cosas que recordás sobre esta persona: ${context.recentMemories.join("; ")}`);
  }
  return lines.join("\n");
}

export const aiProvider: NexusAIProvider = new AnthropicProvider();

/** True only when a real provider is configured — lets callers skip the
 * round-trip entirely instead of awaiting a no-op. */
export const isAiConfigured = Boolean(env.aiApiKey);
