import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Prisma, type ClinicalTemplate as TemplateRow } from "@prisma/client";
import { z } from "zod";
import {
  CLINICAL_TEMPLATES,
  templateCreateSchema,
  templateVersionSchema,
  templateMetadataSchema,
  type ClinicalTemplate,
} from "@nexus/shared";
import { verticalTemplate } from "@nexus/verticals";
import { prisma } from "../lib/prisma.js";
import { encryptClinical, decryptClinical } from "../lib/clinicalCrypto.js";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";

const scope = (userId: string, id: string) => `${userId}:template:${id}`;
// Plantillas base: las médicas y las de otras verticales (`vertical:plantilla`).
const base = (id: string): ClinicalTemplate | undefined =>
  CLINICAL_TEMPLATES.find((t) => t.id === id) ?? verticalTemplate(id);
const view = (row: TemplateRow): ClinicalTemplate => ({
  ...decryptClinical<ClinicalTemplate>(
    row.recordEncrypted,
    scope(row.userId, row.id),
  ),
  id: row.builtinId ?? row.id,
  revision: row.version,
  archived: row.archived,
  favorite: row.favorite,
  builtin: Boolean(row.builtinId),
  lineageId: row.lineageId ?? row.id,
  previousVersionId: row.previousVersionId,
});
async function owned(
  id: string,
  userId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const row = await tx.clinicalTemplate.findFirst({
    where: { userId, ...(base(id) ? { builtinId: id } : { id }) },
  });
  return row;
}
export async function templateFor(
  id: string,
  userId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<ClinicalTemplate> {
  const row = await owned(id, userId, tx);
  if (row?.archived)
    throw new HttpError(400, "Plantilla archivada: elegí una plantilla activa");
  if (base(id))
    return {
      ...base(id)!,
      revision: row?.version ?? 1,
      favorite: row?.favorite ?? false,
      archived: false,
      builtin: true,
    };
  if (!row) throw new HttpError(400, "Plantilla no encontrada");
  return view(row);
}
function matches(
  row: TemplateRow,
  input: {
    name: string;
    description: string;
    fields: ClinicalTemplate["fields"];
  },
) {
  const saved = view(row);
  return (
    saved.name === input.name &&
    saved.description === input.description &&
    JSON.stringify(saved.fields) === JSON.stringify(input.fields)
  );
}
const conflict = () =>
  new HttpError(409, "La plantilla cambió. Recargá antes de guardar.");
export const clinicalTemplatesRouter = Router();
clinicalTemplatesRouter.get(
  "/templates",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        archived: z.enum(["true", "false", "all"]).default("false"),
        q: z.string().max(160).default(""),
      })
      .parse(req.query);
    const rows = await prisma.clinicalTemplate.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
    const templates = [
      ...CLINICAL_TEMPLATES.map((t) => {
        const row = rows.find((r) => r.builtinId === t.id);
        return {
          ...t,
          revision: row?.version ?? 1,
          favorite: row?.favorite ?? false,
          archived: row?.archived ?? false,
          builtin: true,
        };
      }),
      ...rows.filter((r) => !r.builtinId).map(view),
    ]
      .filter(
        (t) =>
          (query.archived === "all" ||
            Boolean(t.archived) === (query.archived === "true")) &&
          `${t.name} ${t.description}`
            .toLocaleLowerCase("es")
            .includes(query.q.toLocaleLowerCase("es")),
      )
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          a.name.localeCompare(b.name, "es"),
      );
    res.json({ templates });
  }),
);
clinicalTemplatesRouter.post(
  "/templates",
  asyncHandler(async (req, res) => {
    const { clientId, ...input } = templateCreateSchema.parse(req.body),
      userId = req.userId!;
    try {
      const result = await prisma.$transaction(async (tx) => {
        if (clientId) {
          const existing = await tx.clinicalTemplate.findFirst({
            where: { userId, clientId },
          });
          if (existing) {
            if (existing.previousVersionId || !matches(existing, input))
              throw new HttpError(
                409,
                "Esta solicitud ya fue guardada con otro contenido. Recargá para revisar la plantilla.",
              );
            return { template: view(existing), replay: true };
          }
        }
        const id = randomUUID(),
          template = { ...input, id, version: 1 };
        const row = await tx.clinicalTemplate.create({
          data: {
            id,
            userId,
            clientId,
            lineageId: id,
            recordEncrypted: encryptClinical(template, scope(userId, id)),
          },
        });
        await recordAudit(
          { userId, action: "clinical.template.create", entityId: id },
          tx,
        );
        return { template: view(row), replay: false };
      });
      res.status(result.replay ? 200 : 201).json({ template: result.template });
    } catch (e) {
      if (
        clientId &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const existing = await prisma.clinicalTemplate.findFirst({
          where: { userId, clientId },
        });
        if (existing) {
          if (existing.previousVersionId || !matches(existing, input))
            throw conflict();
          res.json({ template: view(existing) });
          return;
        }
      }
      throw e;
    }
  }),
);
clinicalTemplatesRouter.patch(
  "/templates/:id",
  asyncHandler(async (req, res) => {
    const input = templateMetadataSchema.parse(req.body),
      userId = req.userId!,
      id = req.params.id!;
    try {
      const template = await prisma.$transaction(async (tx) => {
        let row = await owned(id, userId, tx);
        if (!row && base(id)) {
          if (input.revision !== 1) throw conflict();
          const rowId = randomUUID();
          row = await tx.clinicalTemplate.create({
            data: {
              id: rowId,
              userId,
              builtinId: id,
              recordEncrypted: encryptClinical(base(id), scope(userId, rowId)),
            },
          });
        }
        if (!row) throw new HttpError(404, "Plantilla no encontrada");
        if (input.archived === false && !row.builtinId) {
          const latest = await tx.clinicalTemplate.findMany({
            where: {
              userId,
              OR: [
                { lineageId: row.lineageId ?? row.id },
                { id: row.lineageId ?? row.id },
              ],
            },
          });
          if (latest.some((r) => view(r).version > view(row!).version))
            throw new HttpError(
              409,
              "Hay una versión más nueva. Creá una copia de esta versión histórica para reutilizarla.",
            );
        }
        const changed = await tx.clinicalTemplate.updateMany({
          where: { id: row.id, userId, version: input.revision },
          data: {
            archived: input.archived,
            favorite: input.favorite,
            version: { increment: 1 },
          },
        });
        if (!changed.count) throw conflict();
        await recordAudit(
          { userId, action: "clinical.template.preferences", entityId: id },
          tx,
        );
        return view(
          await tx.clinicalTemplate.findUniqueOrThrow({
            where: { id: row.id },
          }),
        );
      });
      res.json({ template });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw conflict();
      throw e;
    }
  }),
);
clinicalTemplatesRouter.get(
  "/templates/:id/versions",
  asyncHandler(async (req, res) => {
    const id = req.params.id!,
      userId = req.userId!;
    if (base(id)) {
      res.json({ templates: [{ ...base(id)!, builtin: true, revision: 1 }] });
      return;
    }
    const row = await owned(id, userId);
    if (!row) throw new HttpError(404, "Plantilla no encontrada");
    const rows = await prisma.clinicalTemplate.findMany({
      where: {
        userId,
        OR: [
          { lineageId: row.lineageId ?? row.id },
          { id: row.lineageId ?? row.id },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ templates: rows.map(view) });
  }),
);
clinicalTemplatesRouter.post(
  "/templates/:id/versions",
  asyncHandler(async (req, res) => {
    const { revision, clientId, ...input } = templateVersionSchema.parse(
        req.body,
      ),
      userId = req.userId!,
      previousId = req.params.id!;
    if (base(previousId))
      throw new HttpError(
        400,
        "Usá la plantilla base para crear una copia personal",
      );
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.clinicalTemplate.findFirst({
          where: { userId, clientId },
        });
        if (existing) {
          if (
            existing.previousVersionId !== previousId ||
            !matches(existing, input)
          )
            throw conflict();
          return { template: view(existing), replay: true };
        }
        const previous = await owned(previousId, userId, tx);
        if (!previous) throw new HttpError(404, "Plantilla no encontrada");
        const changed = await tx.clinicalTemplate.updateMany({
          where: {
            id: previous.id,
            userId,
            version: revision,
            archived: false,
          },
          data: { archived: true, version: { increment: 1 } },
        });
        if (!changed.count) throw conflict();
        const id = randomUUID(),
          template = { ...input, id, version: view(previous).version + 1 };
        const row = await tx.clinicalTemplate.create({
          data: {
            id,
            userId,
            clientId,
            lineageId: previous.lineageId ?? previous.id,
            previousVersionId: previous.id,
            favorite: previous.favorite,
            recordEncrypted: encryptClinical(template, scope(userId, id)),
          },
        });
        await recordAudit(
          { userId, action: "clinical.template.version", entityId: id },
          tx,
        );
        return { template: view(row), replay: false };
      });
      res.status(result.replay ? 200 : 201).json({ template: result.template });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw conflict();
      throw e;
    }
  }),
);
