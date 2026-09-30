import { Router } from "express";
import {
  createMilestoneSchema,
  createProjectSchema,
  updateProjectSchema,
  projectPlanSchema,
} from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { planProject } from "../lib/projectPlanning.js";
import { recordAudit } from "../lib/audit.js";

export const projectsRouter = Router();
projectsRouter.use(authenticate);

projectsRouter.post(
  "/plan",
  asyncHandler(async (req, res) => {
    const input = projectPlanSchema.parse(req.body);
    res.setHeader("Cache-Control", "no-store");
    res.json(await planProject(input.text, input.useAI));
  }),
);
function withProgress<T extends { tasks: { status: string }[] }>(project: T) {
  const active = project.tasks.filter((task) => task.status !== "CANCELLED");
  const done = active.filter((task) => task.status === "DONE").length;
  return {
    ...project,
    progress: active.length ? Math.round((done / active.length) * 100) : 0,
    taskCount: active.length,
    completedTaskCount: done,
  };
}
projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      include: {
        milestones: true,
        tasks: { where: { userId: req.userId }, select: { status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ projects: projects.map(withProgress) });
  }),
);

projectsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        milestones: true,
        tasks: { where: { userId: req.userId }, orderBy: { createdAt: "asc" } },
        notes: { where: { userId: req.userId } },
      },
    });
    if (!project) throw new HttpError(404, "Project not found");
    res.json({ project: withProgress(project) });
  }),
);

projectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createProjectSchema.parse(req.body);
    const { tasks = [], ...data } = input;
    if (
      input.areaId &&
      !(await prisma.area.findFirst({
        where: { id: input.areaId, userId: req.userId },
      }))
    )
      throw new HttpError(404, "Area not found");
    const project = await prisma.$transaction(async (tx) => {
      if (data.clientId) {
        // Serialize identical retry keys across tabs and concurrent requests.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${req.userId! + ":" + data.clientId}))::text`;
        const existing = await tx.project.findUnique({
          where: {
            userId_clientId: { userId: req.userId!, clientId: data.clientId },
          },
          include: { tasks: true },
        });
        if (existing) return existing;
      }
      const created = await tx.project.create({
        data: {
          ...data,
          userId: req.userId!,
          tasks: {
            create: tasks.map((title) => ({ title, userId: req.userId! })),
          },
        },
        include: { tasks: true },
      });
      await recordAudit(
        {
          userId: req.userId!,
          action: "project.create",
          entityType: "project",
          entityId: created.id,
        },
        tx,
      );
      return created;
    });
    res.status(201).json({ project: withProgress(project) });
  }),
);

projectsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateProjectSchema.parse(req.body);
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new HttpError(404, "Project not found");

    if (
      input.areaId &&
      !(await prisma.area.findFirst({
        where: { id: input.areaId, userId: req.userId },
      }))
    )
      throw new HttpError(404, "Area not found");
    const { progress: ignored, ...data } = input;
    void ignored;
    const project = await prisma.project.update({
      where: { id: existing.id },
      data,
    });
    await recordAudit({
      userId: req.userId!,
      action: "project.update",
      entityType: "project",
      entityId: project.id,
    });
    res.json({ project });
  }),
);

projectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new HttpError(404, "Project not found");

    await prisma.project.delete({ where: { id: existing.id } });
    await recordAudit({
      userId: req.userId!,
      action: "project.delete",
      entityType: "project",
      entityId: existing.id,
    });
    res.status(204).send();
  }),
);

projectsRouter.post(
  "/:id/milestones",
  asyncHandler(async (req, res) => {
    const input = createMilestoneSchema.parse(req.body);
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!project) throw new HttpError(404, "Project not found");

    const milestone = await prisma.projectMilestone.create({
      data: { ...input, projectId: project.id },
    });
    await recordAudit({
      userId: req.userId!,
      action: "project.milestone.create",
      entityType: "project_milestone",
      entityId: milestone.id,
    });
    res.status(201).json({ milestone });
  }),
);
