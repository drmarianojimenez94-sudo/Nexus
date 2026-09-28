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
}

export interface DailyInsightContext {
  userName: string;
  overdueTaskCount: number;
  openTaskTitles: string[];
  upcomingDeadlines: { title: string; dueInHours: number }[];
  eventsToday: number;
  /** Freeform memories (spec §6) the user asked NEXUS to remember, most recent first. */
  recentMemories: string[];
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
}

function buildInsightPrompt(context: DailyInsightContext): string {
  const lines = [
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
