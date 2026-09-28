import { Router } from "express";
import { createMilestoneSchema, createProjectSchema, updateProjectSchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const projectsRouter = Router();
projectsRouter.use(authenticate);

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      include: { milestones: true, _count: { select: { tasks: true } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ projects });
  })
);

projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { milestones: true, tasks: true, notes: true },
    });
    if (!project) throw new HttpError(404, "Project not found");
    res.json({ project });
  })
);

projectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createProjectSchema.parse(req.body);
    const project = await prisma.project.create({ data: { ...input, userId: req.userId! } });
    await recordAudit({ userId: req.userId!, action: "project.create", entityType: "project", entityId: project.id });
    res.status(201).json({ project });
  })
);

projectsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateProjectSchema.parse(req.body);
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Project not found");

    const project = await prisma.project.update({ where: { id: existing.id }, data: input });
    await recordAudit({ userId: req.userId!, action: "project.update", entityType: "project", entityId: project.id });
    res.json({ project });
  })
);

projectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new HttpError(404, "Project not found");

    await prisma.project.delete({ where: { id: existing.id } });
    await recordAudit({ userId: req.userId!, action: "project.delete", entityType: "project", entityId: existing.id });
    res.status(204).send();
  })
);

projectsRouter.post(
  "/:id/milestones",
  asyncHandler(async (req, res) => {
    const input = createMilestoneSchema.parse(req.body);
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!project) throw new HttpError(404, "Project not found");

    const milestone = await prisma.projectMilestone.create({ data: { ...input, projectId: project.id } });
    await recordAudit({
      userId: req.userId!,
      action: "project.milestone.create",
      entityType: "project_milestone",
      entityId: milestone.id,
    });
    res.status(201).json({ milestone });
  })
);
