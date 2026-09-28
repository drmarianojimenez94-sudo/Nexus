import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";

export const todayRouter = Router();
todayRouter.use(authenticate);

/**
 * Single aggregation endpoint backing the Today screen (spec §10):
 * NOW, PRIORIDADES (max 3), TIMELINE, ATTENTION, and one INSIGHT.
 * Phase 1 uses simple rules; Phase 6 swaps the insight for NexusBrain output.
 */
todayRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [nextEvent, todaysEvents, openTasks, overdueTasks, upcomingDeadlines] = await Promise.all([
      prisma.event.findFirst({
        where: { userId, startAt: { gte: now } },
        orderBy: { startAt: "asc" },
      }),
      prisma.event.findMany({
        where: { userId, startAt: { gte: startOfDay, lte: endOfDay } },
        orderBy: { startAt: "asc" },
      }),
      prisma.task.findMany({
        where: { userId, status: { in: ["TODO", "IN_PROGRESS"] } },
        orderBy: [{ priority: "desc" }, { deadline: "asc" }],
        take: 3,
      }),
      prisma.task.count({
        where: { userId, status: { in: ["TODO", "IN_PROGRESS"] }, deadline: { lt: startOfDay } },
      }),
      prisma.task.findMany({
        where: {
          userId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          deadline: { gte: now, lte: in48h },
        },
        orderBy: { deadline: "asc" },
        take: 5,
      }),
    ]);

    const attention: string[] = [];
    if (overdueTasks > 0) {
      attention.push(`${overdueTasks} tarea${overdueTasks === 1 ? "" : "s"} atrasada${overdueTasks === 1 ? "" : "s"}`);
    }
    for (const task of upcomingDeadlines) {
      attention.push(`"${task.title}" vence pronto`);
    }

    let insight: string | null = null;
    if (overdueTasks > 3) {
      insight = "Tenés varias tareas atrasadas. Podría ser buen momento para reprogramar o archivar las que ya no aplican.";
    } else if (openTasks.length === 0 && todaysEvents.length === 0) {
      insight = "No tenés nada pendiente registrado para hoy. Buen momento para planificar la semana.";
    }

    res.json({
      now: nextEvent,
      priorities: openTasks,
      timeline: todaysEvents,
      attention,
      insight,
    });
  })
);
