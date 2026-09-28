import { Router } from "express";
import { createEventSchema, updateEventSchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const eventsRouter = Router();
eventsRouter.use(authenticate);

eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const events = await prisma.event.findMany({
      where: {
        userId: req.userId,
        startAt: {
          gte: typeof from === "string" ? new Date(from) : undefined,
          lte: typeof to === "string" ? new Date(to) : undefined,
        },
      },
      orderBy: { startAt: "asc" },
    });
    res.json({ events });
  })
);

eventsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createEventSchema.parse(req.body);
    const event = await prisma.event.create({ data: { ...input, userId: req.userId! } });
    await recordAudit({ userId: req.userId!, action: "event.create", entityType: "event", entityId: event.id });
    res.status(201).json({ event });
  })
);

eventsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateEventSchema.parse(req.body);
    const existing = await prisma.event.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Event not found");

    const event = await prisma.event.update({ where: { id: existing.id }, data: input });
    await recordAudit({ userId: req.userId!, action: "event.update", entityType: "event", entityId: event.id });
    res.json({ event });
  })
);

eventsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.event.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Event not found");

    await prisma.event.delete({ where: { id: existing.id } });
    await recordAudit({ userId: req.userId!, action: "event.delete", entityType: "event", entityId: existing.id });
    res.status(204).send();
  })
);
