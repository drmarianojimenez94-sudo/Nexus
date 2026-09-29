import { Router } from "express";
import { z } from "zod";
import { aiProvider, isAiConfigured, type NavigateTarget } from "../lib/ai.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const assistantRouter = Router();
assistantRouter.use(authenticate);

const interpretSchema = z.object({ text: z.string().min(1).max(2000) });

const NAVIGATE_PATHS: Record<NavigateTarget, string> = {
  today: "/today",
  inbox: "/inbox",
  calendar: "/calendar",
  projects: "/projects",
  areas: "/areas",
  memory: "/memory",
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
    if (!isAiConfigured) {
      throw new HttpError(501, "NEXUS no tiene IA configurada todavía.");
    }
    const { text } = interpretSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { name: true } });

    const parsed = await aiProvider.interpretUtterance(text, { userName: user.name, now: new Date() });
    if (!parsed) {
      throw new HttpError(502, "No pude interpretar eso. Probá de nuevo.");
    }

    const when = parsed.when ? new Date(parsed.when) : null;
    const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;

    switch (parsed.intent) {
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
        res.json({ speak: parsed.spokenReply, navigateTo: "/calendar" });
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
