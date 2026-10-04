import { Router } from "express";
import { z } from "zod";
import type { PatientInput } from "@nexus/shared";
import {
  buildDayBrief,
  dayBounds,
  evaluateVertical,
  getVertical,
  interpretCapture,
  scoreVertical,
  VERTICALS,
  type RegisteredVertical,
} from "@nexus/verticals";
import { prisma } from "../lib/prisma.js";
import { decryptClinical } from "../lib/clinicalCrypto.js";
import { recordAudit } from "../lib/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { expectedOwner } from "../middleware/expectedOwner.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Fábrica de verticales: cada profesión es un manifiesto (@nexus/verticals).
 * Estas rutas exponen el manifiesto, su puntaje, la captura asistida
 * (determinística: el texto no sale del servidor) y la agenda del día.
 */
export const verticalsRouter = Router();
verticalsRouter.use(authenticate, expectedOwner);

const scope = (userId: string, kind: string, id: string) => `${userId}:${kind}:${id}`;
const patientName = (row: { userId: string; id: string; recordEncrypted: string }) =>
  decryptClinical<PatientInput>(row.recordEncrypted, scope(row.userId, "patient", row.id)).name;

function vertical(id: string): RegisteredVertical {
  const v = getVertical(id);
  if (!v || v.manifest.status === "draft") throw new HttpError(404, "Vertical no disponible");
  return v;
}

const scorecards = new Map<string, ReturnType<typeof scoreVertical>>();
function scorecard(v: RegisteredVertical) {
  let card = scorecards.get(v.manifest.id);
  if (!card) {
    card = scoreVertical(v.manifest, evaluateVertical(v.manifest, v.adapter));
    scorecards.set(v.manifest.id, card);
  }
  return card;
}

verticalsRouter.get("/", (_req, res) => {
  res.json({
    verticals: Object.values(VERTICALS)
      .filter((v) => v.manifest.status !== "draft")
      .map((v) => ({
        id: v.manifest.id,
        name: v.manifest.name,
        profession: v.manifest.profession,
        status: v.manifest.status,
        version: v.manifest.version,
        vocabulary: v.manifest.vocabulary,
        routes: v.manifest.routes,
        score: scorecard(v).score,
      })),
  });
});

verticalsRouter.get("/:id", (req, res) => {
  const { manifest } = vertical(req.params.id!);
  res.json({ manifest });
});

verticalsRouter.get("/:id/scorecard", (req, res) => {
  res.json({ scorecard: scorecard(vertical(req.params.id!)) });
});

const captureSchema = z.object({
  text: z.string().trim().min(2).max(8000),
  subjectId: z.string().uuid().optional(),
  /** typed: escrito; dictated: dictado del profesional; ambient: conversación con el paciente. */
  captureMode: z.enum(["typed", "dictated", "ambient"]).default("typed"),
  consentConfirmed: z.boolean().default(false),
});

verticalsRouter.post(
  "/:id/capture",
  asyncHandler(async (req, res) => {
    const v = vertical(req.params.id!);
    const input = captureSchema.parse(req.body);
    const userId = req.userId!;
    if (input.captureMode === "ambient" && v.manifest.consent.recording.required && !input.consentConfirmed)
      throw new HttpError(400, "Confirmá que el paciente consintió la grabación antes de capturar la conversación.");
    let subjectName: string | undefined;
    let knownAllergies: string[] = [];
    if (input.subjectId) {
      const row = await prisma.patient.findFirst({ where: { id: input.subjectId, userId } });
      if (!row) throw new HttpError(404, "Paciente no encontrado");
      const patient = decryptClinical<PatientInput>(row.recordEncrypted, scope(userId, "patient", row.id));
      subjectName = patient.name;
      knownAllergies = patient.allergies ? patient.allergies.split(/[,;\n]+/).map((a) => a.trim()).filter(Boolean) : [];
    }
    const plan = interpretCapture(input.text, v.manifest, v.adapter, {
      now: new Date(),
      subjectId: input.subjectId,
      subjectName,
      knownAllergies,
    });
    // Sin texto clínico en la auditoría: solo el modo y el consentimiento declarado.
    await recordAudit({
      userId,
      action: "vertical.capture.interpret",
      entityType: "vertical",
      entityId: v.manifest.id,
      metadata: {
        captureMode: input.captureMode,
        consentConfirmed: input.consentConfirmed,
        steps: plan.steps.length,
        redFlags: plan.safety.redFlags.filter((r) => !r.negated).length,
      },
    });
    res.set("Cache-Control", "no-store, private").json({ plan });
  }),
);

verticalsRouter.get(
  "/:id/day",
  asyncHandler(async (req, res) => {
    const v = vertical(req.params.id!);
    const userId = req.userId!;
    const now = new Date();
    const { start, end } = dayBounds(now, v.manifest.timezone);
    const horizon = new Date(end.getTime() + 7 * 86_400_000);
    const [events, followups, drafts] = await Promise.all([
      prisma.event.findMany({ where: { userId, startAt: { gte: start, lt: end } }, orderBy: { startAt: "asc" }, take: 100 }),
      prisma.clinicalFollowup.findMany({
        where: { userId, status: "PENDING", dueAt: { lt: horizon }, patient: { archived: false } },
        include: { patient: true },
        orderBy: { dueAt: "asc" },
        take: 200,
      }),
      prisma.clinicalEncounter.findMany({
        where: { userId, status: "DRAFT" },
        include: { patient: true },
        orderBy: { updatedAt: "asc" },
        take: 50,
      }),
    ]);
    const brief = buildDayBrief(v.manifest, {
      now,
      appointments: events.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt.toISOString(), endAt: e.endAt?.toISOString() ?? null })),
      followups: followups.map((f) => {
        const record = decryptClinical<{ title: string; kind: string }>(f.recordEncrypted, scope(userId, "followup", f.id));
        return { id: f.id, title: record.title, kind: record.kind, dueAt: f.dueAt.toISOString(), subjectId: f.patientId, subjectName: patientName(f.patient) };
      }),
      drafts: drafts.map((d) => ({ id: d.id, subjectId: d.patientId, subjectName: patientName(d.patient), updatedAt: d.updatedAt.toISOString() })),
    });
    await recordAudit({ userId, action: "vertical.day.read", entityType: "vertical", entityId: v.manifest.id });
    res.set("Cache-Control", "no-store, private").json({ brief });
  }),
);
