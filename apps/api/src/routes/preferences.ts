import { Router } from "express";
import { setPreferenceSchema } from "@nexus/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";

export const preferencesRouter = Router();
preferencesRouter.use(authenticate);

/** Returns all preferences as a flat { key: value } map — simplest shape for the client. */
preferencesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await prisma.preference.findMany({ where: { userId: req.userId } });
    const preferences = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    res.json({ preferences });
  })
);

preferencesRouter.put(
  "/:key",
  asyncHandler(async (req, res) => {
    const { value } = setPreferenceSchema.parse(req.body);
    const key = req.params.key!;
    const preference = await prisma.preference.upsert({
      where: { userId_key: { userId: req.userId!, key } },
      create: { userId: req.userId!, key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    res.json({ preference });
  })
);
