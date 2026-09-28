import { Router } from "express";
import { createReminderSchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const remindersRouter = Router();
remindersRouter.use(authenticate);

remindersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const reminders = await prisma.reminder.findMany({
      where: { userId: req.userId },
      orderBy: { remindAt: "asc" },
    });
    res.json({ reminders });
  })
);

remindersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createReminderSchema.parse(req.body);
    const reminder = await prisma.reminder.create({ data: { ...input, userId: req.userId! } });
    await recordAudit({
      userId: req.userId!,
      action: "reminder.create",
      entityType: "reminder",
      entityId: reminder.id,
    });
    res.status(201).json({ reminder });
  })
);

remindersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Reminder not found");

    await prisma.reminder.delete({ where: { id: existing.id } });
    await recordAudit({
      userId: req.userId!,
      action: "reminder.delete",
      entityType: "reminder",
      entityId: existing.id,
    });
    res.status(204).send();
  })
);
