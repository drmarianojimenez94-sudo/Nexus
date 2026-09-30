import { Router } from "express";
import { z } from "zod";
import { followupInputSchema } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { encryptClinical } from "../lib/clinicalCrypto.js";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";
export const clinicalFollowupDetailsRouter = Router();
clinicalFollowupDetailsRouter.put(
  "/followups/:id",
  asyncHandler(async (req, res) => {
    const input = followupInputSchema
      .omit({ patientId: true })
      .extend({ version: z.number().int().min(1) })
      .parse(req.body);
    const userId = req.userId!,
      id = req.params.id!;
    await prisma.$transaction(async (tx) => {
      if (
        !(await tx.clinicalFollowup.findFirst({
          where: { id, userId },
          select: { id: true },
        }))
      )
        throw new HttpError(404, "Seguimiento no encontrado");
      const result = await tx.clinicalFollowup.updateMany({
        where: { id, userId, version: input.version },
        data: {
          dueAt: new Date(input.dueAt),
          version: { increment: 1 },
          recordEncrypted: encryptClinical(
            { title: input.title, kind: input.kind },
            `${userId}:followup:${id}`,
          ),
        },
      });
      if (!result.count)
        throw new HttpError(
          409,
          "El seguimiento cambió. Recargá antes de guardar.",
        );
      await recordAudit(
        { userId, action: "clinical.followup.edit", entityId: id },
        tx,
      );
    });
    res.status(204).send();
  }),
);
