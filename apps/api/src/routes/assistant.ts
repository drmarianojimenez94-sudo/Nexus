import { Router } from "express";
import { z } from "zod";
import { aiProvider, isAiConfigured, type NavigateTarget } from "../lib/ai.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";
import { env } from "../lib/env.js";
import { looksSensitive, medicineVertical } from "@nexus/verticals";
import { prepareEmail, pushGoogleEvent } from "../lib/secretary.js";
import { answerFromWeb, placeName, weatherFor } from "../lib/webAnswer.js";

export const assistantRouter = Router();
assistantRouter.use(authenticate);

assistantRouter.get("/status", (_req, res) => res.json({ aiConfigured: isAiConfigured, provider: env.aiProvider, model: env.aiModel }));

const interpretSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).max(12).default([]),
  /** Ubicación del teléfono (con permiso del usuario): clima «acá», búsquedas cercanas. */
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
});

const NAVIGATE_PATHS: Record<NavigateTarget, string> = {
  today: "/today",
  inbox: "/inbox",
  calendar: "/calendar",
  projects: "/projects",
  areas: "/areas",
  memory: "/memory",
  patients: "/patients",
  patients_day: "/patients/day",
  patient_capture: "/patients/capture",
  followups: "/patients/followups",
  settings: "/settings",
  mail: "/settings#google",
};

/**
 * The "cerebro" (spec Fase 3, NexusBrain — brought forward ahead of
 * schedule because the rule-based voice router mishandled exactly this:
 * "anotame en el calendario que tengo turno el martes" was matching the
 * word "calendario" and just navigating there, never actually creating
 * anything). This turns a sentence into a real action — a calendar
 * event, a task, a reminder, or a memory — via NexusAIProvider, instead
 * of keyword matching.
 *
 * 501 when AI_API_KEY isn't configured so the client can fall back to
 * the always-available rule-based router — this never becomes a hard
 * dependency, same pattern as the rest of NEXUS's AI features.
 */
assistantRouter.post(
  "/interpret",
  asyncHandler(async (req, res) => {
    const { text, history, location } = interpretSchema.parse(req.body);
    // Datos de pacientes: nunca a un proveedor externo ni al inbox sin cifrar.
    // Se derivan al asistente clínico, que interpreta sin IA externa.
    if (!medicineVertical.ai.sensitiveToExternalAI && looksSensitive(text, medicineVertical)) {
      await recordAudit({ userId: req.userId!, action: "assistant.sensitive_redirect", entityType: "vertical", entityId: medicineVertical.id });
      res.json({
        speak: "Eso parece información de un paciente. Lo paso al asistente clínico, que no la envía a servicios externos.",
        navigateTo: medicineVertical.routes.capture,
        handoff: { vertical: medicineVertical.id, text },
      });
      return;
    }
    if (!isAiConfigured) {
      throw new HttpError(501, "NEXUS no tiene IA configurada todavía.");
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { name: true } });

    const [memories, tasks] = await Promise.all([
      prisma.memory.findMany({ where: { userId: req.userId! }, orderBy: { updatedAt: "desc" }, take: 10, select: { content: true } }),
      prisma.task.findMany({ where: { userId: req.userId!, status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: { updatedAt: "desc" }, take: 10, select: { title: true } }),
    ]);
    // Solo la ciudad: ni la dirección ni las coordenadas van al modelo.
    const place = location ? await placeName(location).catch(() => null) : null;
    const where = place ? [place.city, place.region, place.country].filter(Boolean).join(", ") : null;
    const parsed = await aiProvider.interpretUtterance(text, {
      userName: user.name, now: new Date(), history, location: where,
      memories: memories.map((m) => m.content.slice(0, 1000)),
      tasks: tasks.map((t) => t.title.slice(0, 500)),
    });
    if (!parsed) {
      throw new HttpError(502, "No pude interpretar eso. Probá de nuevo.");
    }

    const when = parsed.when ? new Date(parsed.when) : null;
    const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;

    switch (parsed.intent) {
      case "conversation": {
        res.json({ speak: parsed.spokenReply });
        return;
      }
      case "weather":
      case "web_search": {
        // Datos en tiempo real: clima (Open-Meteo) o búsqueda en internet con la IA.
        let answer = null;
        try {
          answer =
            parsed.intent === "weather"
              ? ((await weatherFor(parsed.title, location, place?.city)) ??
                (await answerFromWeb(`Clima actual y pronóstico de hoy en ${parsed.title || place?.city || "Buenos Aires"}`)))
              : await answerFromWeb(parsed.title || text, new Date(), where);
        } catch {
          answer = null;
        }
        await recordAudit({ userId: req.userId!, action: `assistant.${parsed.intent}`, entityType: "assistant", entityId: parsed.intent, metadata: { ok: Boolean(answer) } });
        if (answer && parsed.intent === "weather" && !parsed.title.trim() && !location)
          answer = { ...answer, speak: `${answer.speak} No tengo tu ubicación: si me das permiso, te digo el clima de donde estés.` };
        res.json(
          answer
            ? { speak: answer.speak, sources: answer.sources, ...(parsed.intent === "weather" && !location && !parsed.title.trim() ? { needsLocation: true } : {}) }
            : { speak: "No pude consultar internet ahora. Probá de nuevo en un momento." },
        );
        return;
      }
      case "create_event": {
        if (!validWhen) {
          // The model was told to use "note" when it can't resolve a date —
          // this is a defensive fallback if it didn't, not the normal path.
          const item = await prisma.inboxItem.create({
            data: { rawText: text, source: "VOICE", userId: req.userId! },
          });
          await recordAudit({ userId: req.userId!, action: "inbox.create", entityType: "inbox_item", entityId: item.id });
          res.json({ speak: "No pude entender bien la fecha, lo anoté en tu inbox.", navigateTo: "/inbox" });
          return;
        }
        const event = await prisma.event.create({
          data: { title: parsed.title, startAt: validWhen, userId: req.userId! },
        });
        await recordAudit({ userId: req.userId!, action: "event.create", entityType: "event", entityId: event.id });
        // También en Google Calendar si está conectado con permiso de escritura;
        // la app nativa lo copia además al calendario del teléfono.
        const google = await pushGoogleEvent(req.userId!, { title: event.title, startAt: event.startAt, endAt: event.endAt });
        res.json({
          speak: parsed.spokenReply,
          navigateTo: "/calendar",
          event: { id: event.id, title: event.title, startAt: event.startAt.toISOString(), endAt: event.endAt?.toISOString() ?? null, google },
        });
        return;
      }
      case "create_task": {
        const task = await prisma.task.create({
          data: { title: parsed.title, deadline: validWhen, userId: req.userId! },
        });
        await recordAudit({ userId: req.userId!, action: "task.create", entityType: "task", entityId: task.id });
        res.json({ speak: parsed.spokenReply, navigateTo: "/today" });
        return;
      }
      case "create_reminder": {
        if (!validWhen) {
          const item = await prisma.inboxItem.create({
            data: { rawText: text, source: "VOICE", userId: req.userId! },
          });
          await recordAudit({ userId: req.userId!, action: "inbox.create", entityType: "inbox_item", entityId: item.id });
          res.json({ speak: "No pude entender bien cuándo, lo anoté en tu inbox.", navigateTo: "/inbox" });
          return;
        }
        const reminder = await prisma.reminder.create({
          data: { title: parsed.title, remindAt: validWhen, userId: req.userId! },
        });
        await recordAudit({
          userId: req.userId!,
          action: "reminder.create",
          entityType: "reminder",
          entityId: reminder.id,
        });
        res.json({ speak: parsed.spokenReply, navigateTo: "/today" });
        return;
      }
      case "set_alarm": {
        if (!validWhen) {
          res.json({ speak: "¿A qué hora querés la alarma?" });
          return;
        }
        // Queda también como recordatorio en Nexus; la app nativa programa la alarma del teléfono.
        const reminder = await prisma.reminder.create({
          data: { title: parsed.title || "Alarma", remindAt: validWhen, userId: req.userId! },
        });
        await recordAudit({ userId: req.userId!, action: "reminder.create", entityType: "reminder", entityId: reminder.id, metadata: { alarm: true } });
        res.json({ speak: parsed.spokenReply, alarm: { at: validWhen.toISOString(), title: reminder.title } });
        return;
      }
      case "send_email": {
        if (!parsed.emailTo || !parsed.emailBody) {
          res.json({ speak: "¿A quién se lo mando y qué querés decirle?" });
          return;
        }
        const draft = await prepareEmail(req.userId!, {
          to: parsed.emailTo,
          subject: parsed.emailSubject || parsed.title || "(sin asunto)",
          body: parsed.emailBody,
        });
        res.json({
          speak: draft.connected ? `${parsed.spokenReply}` : `Te redacté el mail. ${draft.note ?? ""}`.trim(),
          emailDraft: draft,
        });
        return;
      }
      case "remember": {
        const memory = await prisma.memory.create({
          data: { content: text, source: "user_explicit", userId: req.userId! },
        });
        await recordAudit({ userId: req.userId!, action: "memory.create", entityType: "memory", entityId: memory.id });
        res.json({ speak: parsed.spokenReply, navigateTo: "/memory" });
        return;
      }
      case "navigate": {
        const path = NAVIGATE_PATHS[parsed.target ?? "today"];
        // "today" gets the client's own rich spoken summary (live NOW/
        // priorities/attention via speakTodaySummary()) instead of this
        // generic line — the client overrides `speak` for that one case,
        // see voiceCommands.ts.
        res.json({ speak: parsed.spokenReply, navigateTo: path, target: parsed.target });
        return;
      }
      case "note":
      default: {
        const item = await prisma.inboxItem.create({
          data: { rawText: text, source: "VOICE", userId: req.userId! },
        });
        await recordAudit({ userId: req.userId!, action: "inbox.create", entityType: "inbox_item", entityId: item.id });
        res.json({ speak: parsed.spokenReply, navigateTo: "/inbox" });
        return;
      }
    }
  })
);
