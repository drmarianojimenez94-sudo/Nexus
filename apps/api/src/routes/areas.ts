import { Router } from "express";
import { createAreaSchema, updateAreaSchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const areasRouter = Router();
areasRouter.use(authenticate);

areasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const areas = await prisma.area.findMany({
      where: { userId: req.userId },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ areas });
  })
);

areasRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createAreaSchema.parse(req.body);
    const area = await prisma.area.create({ data: { ...input, userId: req.userId! } });
    await recordAudit({ userId: req.userId!, action: "area.create", entityType: "area", entityId: area.id });
    res.status(201).json({ area });
  })
);

areasRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateAreaSchema.parse(req.body);
    const existing = await prisma.area.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Area not found");

    const area = await prisma.area.update({ where: { id: existing.id }, data: input });
    await recordAudit({ userId: req.userId!, action: "area.update", entityType: "area", entityId: area.id });
    res.json({ area });
  })
);

areasRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.area.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Area not found");

    await prisma.area.delete({ where: { id: existing.id } });
    await recordAudit({ userId: req.userId!, action: "area.delete", entityType: "area", entityId: existing.id });
    res.status(204).send();
  })
);
