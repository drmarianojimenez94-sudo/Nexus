import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { Prisma, type Patient, type ClinicalEncounter } from "@prisma/client";
import {
  patientInputSchema,
  clinicalProfileSchema,
  PREFERENCE_KEYS,
  encounterInputSchema,
  followupInputSchema,
  type PatientInput,
  type ClinicalTemplate,
  type EncounterInput,
  type ClinicalEncounter as ClinicalEncounterView,
} from "@nexus/shared";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  encryptClinical,
  decryptClinical,
  clinicalHash,
  searchTokens,
  queryTokens,
  normalizeDocument,
} from "../lib/clinicalCrypto.js";
import { recordAudit } from "../lib/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { HttpError } from "../middleware/errorHandler.js";

import { clinicalTemplatesRouter, templateFor } from "./clinicalTemplates.js";
import { clinicalHistoryRouter } from "./clinicalHistory.js";
import { clinicalFollowupDetailsRouter } from "./clinicalFollowupDetails.js";

export const clinicalRouter = Router();
clinicalRouter.use(authenticate);
clinicalRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  const expectedOwner = _req.get("X-Nexus-Owner");
  if (expectedOwner && expectedOwner !== _req.userId) {
    res.status(409).json({
      error:
        "La cuenta cambió en otra pestaña. Volvé a ingresar antes de continuar.",
    });
    return;
  }
  next();
});
clinicalRouter.use(
  clinicalTemplatesRouter,
  clinicalHistoryRouter,
  clinicalFollowupDetailsRouter,
);
function mutation(
  handler: (
    req: Request,
    tx: Prisma.TransactionClient,
  ) => Promise<{ status?: number; body?: unknown } | undefined>,
) {
  return asyncHandler(async (req, res) => {
    const result = await prisma.$transaction((tx) => handler(req, tx));
    res.status(result?.status || 200);
    if (result?.status === 204) res.send();
    else res.json(result?.body);
  });
}
const scope = (userId: string, kind: string, id: string) =>
  `${userId}:${kind}:${id}`;
const patientView = (row: Patient) => ({
  ...decryptClinical<PatientInput>(
    row.recordEncrypted,
    scope(row.userId, "patient", row.id),
  ),
  id: row.id,
  archived: row.archived,
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
type EncounterRecord = EncounterInput &
  Pick<
    ClinicalEncounterView,
    "template" | "patientSnapshot" | "clinicianSnapshot"
  >;
const encounterView = (row: ClinicalEncounter) => ({
  ...decryptClinical<EncounterRecord>(
    row.recordEncrypted,
    scope(row.userId, "encounter", row.id),
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
async function ownedPatient(
  id: string,
  userId: string,
  database: Prisma.TransactionClient = prisma,
) {
  const row = await database.patient.findFirst({ where: { id, userId } });
  if (!row) throw new HttpError(404, "Paciente no encontrado");
  return row;
}
async function ownedEncounter(
  id: string,
  userId: string,
  database: Prisma.TransactionClient = prisma,
) {
  const row = await database.clinicalEncounter.findFirst({
    where: { id, userId },
  });
  if (!row) throw new HttpError(404, "Consulta no encontrada");
  return row;
}
function validateFields(input: EncounterInput, template: ClinicalTemplate) {
  if (
    Object.keys(input.fields).some(
      (key) => !template.fields.some((f) => f.key === key),
    )
  )
    throw new HttpError(
      400,
      "La consulta contiene campos ajenos a la plantilla",
    );
}
clinicalRouter.get(
  "/patients",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        q: z.string().max(160).default(""),
        page: z.coerce.number().int().min(1).default(1),
        archived: z.enum(["true", "false", "all"]).default("false"),
      })
      .parse(req.query);
    const tokens = queryTokens(query.q, req.userId!);
    const where = {
      userId: req.userId!,
      ...(query.archived === "all"
        ? {}
        : { archived: query.archived === "true" }),
      ...(tokens.length ? { searchTokens: { hasEvery: tokens } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 30,
        skip: (query.page - 1) * 30,
      }),
      prisma.patient.count({ where }),
    ]);
    await recordAudit({ userId: req.userId!, action: "clinical.patient.list" });
    res.json({ patients: rows.map(patientView), total, page: query.page });
  }),
);
clinicalRouter.post(
  "/patients",
  mutation(async (req, tx) => {
    const input = patientInputSchema
        .extend({ clientId: z.string().uuid().optional() })
        .parse(req.body),
      id = randomUUID(),
      userId = req.userId!;
    try {
      if (input.clientId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:patient:${input.clientId}`}))`;
        const existing = await tx.patient.findUnique({
          where: { userId_clientId: { userId, clientId: input.clientId } },
        });
        if (existing) {
          if (
            JSON.stringify(patientInputSchema.parse(input)) !==
            JSON.stringify(patientInputSchema.parse(patientView(existing)))
          )
            throw new HttpError(
              409,
              "Este intento ya se guardó con otros datos. Revisá la ficha existente.",
            );
          return { body: { patient: patientView(existing) } };
        }
      }
      const row = await tx.patient.create({
        data: {
          id,
          userId,
          clientId: input.clientId,
          recordEncrypted: encryptClinical(
            patientInputSchema.parse(input),
            scope(userId, "patient", id),
          ),
          searchTokens: searchTokens(input.name, input.document, userId),
          documentHash: input.document
            ? clinicalHash(normalizeDocument(input.document), userId)
            : null,
        },
      });
      await recordAudit(
        {
          userId,
          action: "clinical.patient.create",
          entityId: id,
        },
        tx,
      );
      return { status: 201, body: { patient: patientView(row) } };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      )
        throw new HttpError(409, "Ya existe un paciente con ese documento");
      throw err;
    }
  }),
);
clinicalRouter.get(
  "/patients/:id",
  asyncHandler(async (req, res) => {
    const row = await ownedPatient(req.params.id!, req.userId!);
    const where = { userId: req.userId!, patientId: row.id };
    const [encounters, total] = await Promise.all([
      prisma.clinicalEncounter.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      prisma.clinicalEncounter.count({ where }),
    ]);
    await recordAudit({
      userId: req.userId!,
      action: "clinical.patient.read",
      entityId: row.id,
    });
    res.json({
      patient: patientView(row),
      encounters: encounters.map((e, i) => ({
        ...encounterView(e),
        folio: total - i,
      })),
    });
  }),
);
clinicalRouter.get(
  "/patients/:id/export",
  asyncHandler(async (req, res) => {
    const patient = await ownedPatient(req.params.id!, req.userId!);
    const [encounters, followups] = await Promise.all([
      prisma.clinicalEncounter.findMany({
        where: { userId: patient.userId, patientId: patient.id },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      }),
      prisma.clinicalFollowup.findMany({
        where: { userId: patient.userId, patientId: patient.id },
      }),
    ]);
    await recordAudit({
      userId: patient.userId,
      action: "clinical.patient.export",
      entityId: patient.id,
    });
    res.json({
      exportedAt: new Date(),
      patient: patientView(patient),
      encounters: encounters.map((e, i) => ({
        ...encounterView(e),
        folio: i + 1,
      })),
      followups: followups.map((row) => ({
        ...decryptClinical<{ title: string; kind: string }>(
          row.recordEncrypted,
          scope(row.userId, "followup", row.id),
        ),
        id: row.id,
        dueAt: row.dueAt,
        status: row.status,
      })),
    });
  }),
);
clinicalRouter.put(
  "/patients/:id",
  mutation(async (req, tx) => {
    const input = patientInputSchema
      .extend({
        version: z.number().int().min(1),
        archived: z.boolean().default(false),
      })
      .parse(req.body);
    const row = await ownedPatient(req.params.id!, req.userId!, tx);
    const record = patientInputSchema.parse(input);
    try {
      const updated = await tx.patient.updateMany({
        where: { id: row.id, userId: row.userId, version: input.version },
        data: {
          recordEncrypted: encryptClinical(
            record,
            scope(row.userId, "patient", row.id),
          ),
          searchTokens: searchTokens(record.name, record.document, row.userId),
          documentHash: record.document
            ? clinicalHash(normalizeDocument(record.document), row.userId)
            : null,
          archived: input.archived,
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new HttpError(
          409,
          "La ficha cambió en otro dispositivo. Recargá antes de guardar",
        );
      await recordAudit(
        {
          userId: row.userId,
          action: "clinical.patient.update",
          entityId: row.id,
        },
        tx,
      );
      return {
        status: 200,
        body: {
          patient: patientView(await ownedPatient(row.id, row.userId, tx)),
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      )
        throw new HttpError(409, "Ya existe un paciente con ese documento");
      throw err;
    }
  }),
);
clinicalRouter.post(
  "/patients/:id/encounters",
  mutation(async (req, tx) => {
    const input = encounterInputSchema
        .extend({ clientId: z.string().uuid() })
        .parse(req.body),
      userId = req.userId!;
    const patient = await ownedPatient(req.params.id!, userId, tx);
    const existing = await tx.clinicalEncounter.findUnique({
      where: { userId_clientId: { userId, clientId: input.clientId } },
    });
    if (existing) {
      if (existing.patientId !== patient.id)
        throw new HttpError(409, "Identificador de consulta ya utilizado");
      return { status: 200, body: { encounter: encounterView(existing) } };
      return;
    }
    if (patient.archived)
      throw new HttpError(409, "Reactivá la ficha antes de agregar consultas");
    const template = await templateFor(input.templateId, userId, tx);
    validateFields(input, template);
    const id = randomUUID(),
      record = { ...encounterInputSchema.parse(input), template };
    const row = await tx.clinicalEncounter.upsert({
      where: { userId_clientId: { userId, clientId: input.clientId } },
      update: {},
      create: {
        id,
        userId,
        patientId: patient.id,
        clientId: input.clientId,
        occurredAt: new Date(input.occurredAt),
        recordEncrypted: encryptClinical(
          record,
          scope(userId, "encounter", id),
        ),
      },
    });
    if (row.patientId !== patient.id)
      throw new HttpError(409, "Identificador de consulta ya utilizado");
    await recordAudit(
      {
        userId,
        action: "clinical.encounter.create",
        entityId: row.id,
      },
      tx,
    );
    return { status: 201, body: { encounter: encounterView(row) } };
  }),
);
clinicalRouter.get(
  "/encounters/:id",
  asyncHandler(async (req, res) => {
    const row = await ownedEncounter(req.params.id!, req.userId!);
    await recordAudit({
      userId: row.userId,
      action: "clinical.encounter.read",
      entityId: row.id,
    });
    res.json({
      encounter: encounterView(row),
      patient: patientView(await ownedPatient(row.patientId, row.userId)),
    });
  }),
);
clinicalRouter.put(
  "/encounters/:id",
  mutation(async (req, tx) => {
    const input = encounterInputSchema
      .extend({ version: z.number().int().min(1) })
      .parse(req.body);
    const row = await ownedEncounter(req.params.id!, req.userId!, tx);
    if (row.status !== "DRAFT")
      throw new HttpError(
        409,
        "La consulta está validada. Agregá una nueva evolución para corregirla",
      );
    const saved = decryptClinical<EncounterRecord>(
      row.recordEncrypted,
      scope(row.userId, "encounter", row.id),
    );
    if (input.templateId !== saved.templateId)
      throw new HttpError(
        400,
        "No se puede cambiar la plantilla de una consulta guardada",
      );
    validateFields(input, saved.template);
    const record = {
      ...encounterInputSchema.parse(input),
      template: saved.template,
    };
    const result = await tx.clinicalEncounter.updateMany({
      where: {
        id: row.id,
        userId: row.userId,
        version: input.version,
        status: "DRAFT",
      },
      data: {
        recordEncrypted: encryptClinical(
          record,
          scope(row.userId, "encounter", row.id),
        ),
        occurredAt: new Date(input.occurredAt),
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new HttpError(
        409,
        "La consulta cambió. Recargá para evitar sobrescribir otra versión",
      );
    await recordAudit(
      {
        userId: row.userId,
        action: "clinical.encounter.update",
        entityId: row.id,
      },
      tx,
    );
    return {
      status: 200,
      body: {
        encounter: encounterView(await ownedEncounter(row.id, row.userId, tx)),
      },
    };
  }),
);
clinicalRouter.post(
  "/encounters/:id/finalize",
  mutation(async (req, tx) => {
    const { version, confirmed } = z
      .object({ version: z.number().int().min(1), confirmed: z.literal(true) })
      .parse(req.body);
    const row = await ownedEncounter(req.params.id!, req.userId!, tx);
    const record = decryptClinical<EncounterRecord>(
      row.recordEncrypted,
      scope(row.userId, "encounter", row.id),
    );
    if (!Object.values(record.fields).some((v) => v.trim()))
      throw new HttpError(400, "Completá al menos un campo antes de validar");
    if (record.dictation.trim())
      throw new HttpError(
        400,
        "Revisá la transcripción: incorporala a los campos o descartala antes de validar",
      );
    const patient = await ownedPatient(row.patientId, row.userId, tx);
    const [user, profile] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: row.userId },
        select: { id: true, name: true, email: true },
      }),
      tx.preference.findUnique({
        where: {
          userId_key: { userId: row.userId, key: PREFERENCE_KEYS.CLINICAL_PROFILE },
        },
      }),
    ]);
    const parsedProfile = clinicalProfileSchema.safeParse(profile?.value ?? {});
    const clinician = {
      ...user,
      ...(parsedProfile.success ? parsedProfile.data : { specialty: "", license: "" }),
    };
    const finalRecord: EncounterRecord = {
      ...record,
      patientSnapshot: {
        ...patientInputSchema.parse(patientView(patient)),
        id: patient.id,
      },
      clinicianSnapshot: clinician,
    };
    const result = await tx.clinicalEncounter.updateMany({
      where: { id: row.id, userId: row.userId, status: "DRAFT", version },
      data: {
        status: confirmed ? "FINAL" : "DRAFT",
        recordEncrypted: encryptClinical(
          finalRecord,
          scope(row.userId, "encounter", row.id),
        ),
        finalizedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new HttpError(409, "La consulta cambió o ya fue validada");
    await recordAudit(
      {
        userId: row.userId,
        action: "clinical.encounter.finalize",
        entityId: row.id,
      },
      tx,
    );
    return {
      status: 200,
      body: {
        encounter: encounterView(await ownedEncounter(row.id, row.userId, tx)),
      },
    };
  }),
);
clinicalRouter.get(
  "/followups",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        patientId: z.string().uuid().optional(),
        status: z.enum(["PENDING", "DONE"]).default("PENDING"),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const { page, ...filters } = query;
    const where = { userId: req.userId!, ...filters };
    const [rows, total] = await Promise.all([
      prisma.clinicalFollowup.findMany({
        where,
        include: { patient: true },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        take: 50,
        skip: (page - 1) * 50,
      }),
      prisma.clinicalFollowup.count({ where }),
    ]);
    await recordAudit({
      userId: req.userId!,
      action: "clinical.followup.list",
    });
    res.json({
      total,
      page,
      pageSize: 50,
      followups: rows.map((row) => ({
        ...decryptClinical<{ title: string; kind: string }>(
          row.recordEncrypted,
          scope(row.userId, "followup", row.id),
        ),
        id: row.id,
        patientId: row.patientId,
        patientName: patientView(row.patient).name,
        version: row.version,
        dueAt: row.dueAt,
        status: row.status,
      })),
    });
  }),
);
clinicalRouter.post(
  "/followups",
  mutation(async (req, tx) => {
    const input = followupInputSchema
        .extend({ clientId: z.string().uuid().optional() })
        .parse(req.body),
      userId = req.userId!,
      id = randomUUID();
    await ownedPatient(input.patientId, userId, tx);
    if (input.clientId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:followup:${input.clientId}`}))`;
      const existing = await tx.clinicalFollowup.findUnique({
        where: { userId_clientId: { userId, clientId: input.clientId } },
      });
      if (existing) {
        const saved = decryptClinical<{ title: string; kind: string }>(
          existing.recordEncrypted,
          scope(userId, "followup", existing.id),
        );
        if (
          existing.patientId !== input.patientId ||
          saved.title !== input.title ||
          saved.kind !== input.kind ||
          existing.dueAt.toISOString() !== input.dueAt
        )
          throw new HttpError(
            409,
            "Este seguimiento ya se guardó con otros datos",
          );
        return { body: { followup: { id: existing.id } } };
      }
    }
    const row = await tx.clinicalFollowup.create({
      data: {
        id,
        userId,
        clientId: input.clientId,
        patientId: input.patientId,
        dueAt: new Date(input.dueAt),
        recordEncrypted: encryptClinical(
          { title: input.title, kind: input.kind },
          scope(userId, "followup", id),
        ),
      },
    });
    await recordAudit(
      {
        userId,
        action: "clinical.followup.create",
        entityId: id,
      },
      tx,
    );
    return { status: 201, body: { followup: { id: row.id } } };
  }),
);
clinicalRouter.patch(
  "/followups/:id",
  mutation(async (req, tx) => {
    const { status, version } = z
      .object({
        status: z.enum(["PENDING", "DONE"]),
        version: z.number().int().min(1).optional(),
      })
      .parse(req.body);
    const owned = await tx.clinicalFollowup.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!owned) throw new HttpError(404, "Seguimiento no encontrado");
    const result = await tx.clinicalFollowup.updateMany({
      where: {
        id: req.params.id,
        userId: req.userId!,
        ...(version ? { version } : {}),
      },
      data: { status, version: { increment: 1 } },
    });
    if (!result.count)
      throw new HttpError(
        409,
        "El seguimiento cambió o no está disponible. Recargá antes de continuar.",
      );
    await recordAudit(
      {
        userId: req.userId!,
        action: "clinical.followup.update",
        entityId: req.params.id,
      },
      tx,
    );
    return { status: 204 };
  }),
);
