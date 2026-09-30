import { Router } from "express";
import type { ClinicalEncounter as Row } from "@prisma/client";
import { z } from "zod";
import type { ClinicalEncounter } from "@nexus/shared";
import { prisma } from "../lib/prisma.js";
import { decryptClinical } from "../lib/clinicalCrypto.js";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";

export const clinicalHistoryRouter = Router();
const view = (row: Row) => ({
  ...decryptClinical<ClinicalEncounter>(
    row.recordEncrypted,
    `${row.userId}:encounter:${row.id}`,
  ),
  id: row.id,
  patientId: row.patientId,
  occurredAt: row.occurredAt,
  status: row.status,
  version: row.version,
  finalizedAt: row.finalizedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
clinicalHistoryRouter.get(
  "/patients/:id/history",
  asyncHandler(async (req, res) => {
    const userId = req.userId!,
      patientId = req.params.id!;
    if (
      !(await prisma.patient.findFirst({
        where: { id: patientId, userId },
        select: { id: true },
      }))
    )
      throw new HttpError(404, "Paciente no encontrado");
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        status: z.enum(["DRAFT", "FINAL", "ALL"]).default("ALL"),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        templateId: z.string().max(100).optional(),
        q: z.string().trim().max(160).default(""),
      })
      .parse(req.query);
    if (query.from && query.to && query.from > query.to)
      throw new HttpError(400, "El rango de fechas es inválido");
    const where = {
      userId,
      patientId,
      ...(query.status !== "ALL" ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const pageSize = 30,
      skip = (query.page - 1) * pageSize;
    let encounters: ReturnType<typeof view>[] = [],
      total = 0;
    if (!query.templateId && !query.q) {
      const [rows, count] = await Promise.all([
        prisma.clinicalEncounter.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          skip,
          take: pageSize,
        }),
        prisma.clinicalEncounter.count({ where }),
      ]);
      encounters = rows.map(view);
      total = count;
    } else {
      // Clinical free text and template snapshots remain encrypted: scan only this
      // owner's patient in bounded batches, returning a bounded page to the client.
      let cursor: string | undefined;
      const needle = query.q.toLocaleLowerCase("es");
      for (;;) {
        const rows = await prisma.clinicalEncounter.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) {
          const encounter = view(row);
          if (query.templateId && encounter.templateId !== query.templateId)
            continue;
          if (
            needle &&
            !Object.values(encounter.fields)
              .join(" ")
              .toLocaleLowerCase("es")
              .includes(needle)
          )
            continue;
          if (total >= skip && encounters.length < pageSize)
            encounters.push(encounter);
          total++;
        }
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1]!.id;
      }
    }
    await recordAudit({
      userId,
      action: "clinical.encounter.history",
      entityId: patientId,
    });
    res.json({ encounters, total, page: query.page, pageSize });
  }),
);
