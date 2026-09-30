import { Router } from "express";
import { createInboxItemSchema, quickCaptureSchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "../lib/audit.js";

export const inboxRouter = Router();
inboxRouter.use(authenticate);

inboxRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await prisma.inboxItem.findMany({
      where: { userId: req.userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items });
  }),
);

inboxRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createInboxItemSchema.parse(req.body);
    const item = await prisma.inboxItem.create({
      data: { ...input, userId: req.userId! },
    });
    await recordAudit({
      userId: req.userId!,
      action: "inbox.create",
      entityType: "inbox_item",
      entityId: item.id,
    });
    res.status(201).json({ item });
  }),
);

inboxRouter.post(
  "/:id/dismiss",
  asyncHandler(async (req, res) => {
    const existing = await prisma.inboxItem.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new HttpError(404, "Inbox item not found");

    const item = await prisma.inboxItem.update({
      where: { id: existing.id },
      data: { status: "DISMISSED" },
    });
    res.json({ item });
  }),
);

/**
 * Quick Capture (spec §11): a single, always-reachable entry point to dump a
 * thought without classifying it. Phase 1 stores it as an inbox item; the
 * NexusBrain classifier (Phase 3) will later suggest where it belongs.
 */
export const quickCaptureRouter = Router();
quickCaptureRouter.use(authenticate);

quickCaptureRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = quickCaptureSchema.parse(req.body);
    if (input.expectedOwnerId && input.expectedOwnerId !== req.userId)
      throw new HttpError(
        409,
        "La captura pertenece a otra sesión. Volvé a ingresar con su cuenta original",
      );
    const data = {
      rawText: input.rawText,
      source: input.source,
      captureId: input.captureId,
    };
    const item = input.captureId
      ? await prisma.inboxItem.upsert({
          where: {
            userId_captureId: {
              userId: req.userId!,
              captureId: input.captureId,
            },
          },
          update: {},
          create: { ...data, userId: req.userId! },
        })
      : await prisma.inboxItem.create({
          data: { ...data, userId: req.userId! },
        });
    await recordAudit({
      userId: req.userId!,
      action: "quick_capture.create",
      entityType: "inbox_item",
      entityId: item.id,
    });
    res.status(201).json({ item });
  }),
);
