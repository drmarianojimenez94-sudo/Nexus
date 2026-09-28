import { Router } from "express";
import { createMemorySchema, updateMemorySchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const memoryRouter = Router();
memoryRouter.use(authenticate);

/**
 * GET /memories?q=... — list, optionally filtered by a case-insensitive
 * substring match on content (spec §6: memory has to be searchable, not
 * just visible).
 */
memoryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    const memories = await prisma.memory.findMany({
      where: {
        userId: req.userId,
        content: typeof q === "string" && q.trim() ? { contains: q.trim(), mode: "insensitive" } : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ memories });
  })
);

memoryRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createMemorySchema.parse(req.body);
    const memory = await prisma.memory.create({ data: { ...input, userId: req.userId! } });
    await recordAudit({ userId: req.userId!, action: "memory.create", entityType: "memory", entityId: memory.id });
    res.status(201).json({ memory });
  })
);

memoryRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateMemorySchema.parse(req.body);
    const existing = await prisma.memory.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Memory not found");

    const memory = await prisma.memory.update({ where: { id: existing.id }, data: input });
    await recordAudit({ userId: req.userId!, action: "memory.update", entityType: "memory", entityId: memory.id });
    res.json({ memory });
  })
);

memoryRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.memory.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Memory not found");

    await prisma.memory.delete({ where: { id: existing.id } });
    await recordAudit({ userId: req.userId!, action: "memory.delete", entityType: "memory", entityId: existing.id });
    res.status(204).send();
  })
);
