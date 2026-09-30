import { Router } from "express";
import {
  createSubtaskSchema,
  createTaskSchema,
  updateTaskSchema,
} from "@nexus/shared";
import { TaskStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const tasksRouter = Router();
tasksRouter.use(authenticate);

async function checkLinks(
  userId: string,
  input: { projectId?: string; areaId?: string },
) {
  if (
    input.projectId &&
    !(await prisma.project.findFirst({
      where: { id: input.projectId, userId },
    }))
  )
    throw new HttpError(404, "Project not found");
  if (
    input.areaId &&
    !(await prisma.area.findFirst({ where: { id: input.areaId, userId } }))
  )
    throw new HttpError(404, "Area not found");
}
tasksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, projectId, areaId } = req.query;
    const where: Prisma.TaskWhereInput = {
      userId: req.userId,
      projectId: typeof projectId === "string" ? projectId : undefined,
      areaId: typeof areaId === "string" ? areaId : undefined,
    };
    if (typeof status === "string" && status in TaskStatus) {
      where.status = status as keyof typeof TaskStatus;
    }
    const tasks = await prisma.task.findMany({
      where,
      include: { subtasks: true },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    });
    res.json({ tasks });
  }),
);

tasksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createTaskSchema.parse(req.body);
    await checkLinks(req.userId!, input);
    const task = await prisma.task.create({
      data: { ...input, userId: req.userId! },
    });
    await recordAudit({
      userId: req.userId!,
      action: "task.create",
      entityType: "task",
      entityId: task.id,
    });
    res.status(201).json({ task });
  }),
);

tasksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = updateTaskSchema.parse(req.body);
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new HttpError(404, "Task not found");

    await checkLinks(req.userId!, input);
    const isCompleting = input.status === "DONE" && existing.status !== "DONE";
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: {
        ...input,
        completedAt:
          input.status && input.status !== "DONE"
            ? null
            : isCompleting
              ? new Date()
              : existing.completedAt,
      },
    });
    await recordAudit({
      userId: req.userId!,
      action: isCompleting ? "task.complete" : "task.update",
      entityType: "task",
      entityId: task.id,
    });
    res.json({ task });
  }),
);

tasksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new HttpError(404, "Task not found");

    await prisma.task.delete({ where: { id: existing.id } });
    await recordAudit({
      userId: req.userId!,
      action: "task.delete",
      entityType: "task",
      entityId: existing.id,
    });
    res.status(204).send();
  }),
);

tasksRouter.post(
  "/:id/subtasks",
  asyncHandler(async (req, res) => {
    const input = createSubtaskSchema.parse(req.body);
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!task) throw new HttpError(404, "Task not found");

    const subtask = await prisma.subtask.create({
      data: { ...input, taskId: task.id },
    });
    res.status(201).json({ subtask });
  }),
);

tasksRouter.patch(
  "/:id/subtasks/:subtaskId",
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!task) throw new HttpError(404, "Task not found");

    const existingSubtask = await prisma.subtask.findFirst({
      where: { id: req.params.subtaskId, taskId: task.id },
    });
    if (!existingSubtask) throw new HttpError(404, "Subtask not found");
    if (typeof req.body.done !== "boolean")
      throw new HttpError(400, "done must be a boolean");
    const subtask = await prisma.subtask.update({
      where: { id: existingSubtask.id },
      data: { done: req.body.done },
    });
    res.json({ subtask });
  }),
);
