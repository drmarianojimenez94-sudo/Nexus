import { Router } from "express";
import { z } from "zod";
import type { PatientInput } from "@nexus/shared";
import {
  ageFrom,
  buildDayBrief,
  dayBounds,
  deidentify,
  evaluateVertical,
  habitsFor,
  matchGuidelines,
  preventiveReminders,
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
import { isClinicalAiConfigured, suggestForCase } from "../lib/clinicalAssist.js";
import { learnFromFields, loadHabits, saveHabits } from "../lib/clinicalHabits.js";
import { structureDictation } from "../lib/clinicalStructure.js";
import { env } from "../lib/env.js";

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
  templateId: z.string().max(100).optional(),
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
    let context: PatientInput | null = null;
    if (input.subjectId) {
      const row = await prisma.patient.findFirst({ where: { id: input.subjectId, userId } });
      if (!row) throw new HttpError(404, "Paciente no encontrado");
      context = decryptClinical<PatientInput>(row.recordEncrypted, scope(userId, "patient", row.id));
      subjectName = context.name;
      knownAllergies = context.allergies ? context.allergies.split(/[,;\n]+/).map((a) => a.trim()).filter(Boolean) : [];
    }
    const ctx = { now: new Date(), subjectId: input.subjectId, subjectName, knownAllergies, templateId: input.templateId };
    // Las reglas separan quién es el paciente (nombre, DNI, teléfono); eso nunca va a la IA.
    let plan = interpretCapture(input.text, v.manifest, v.adapter, ctx);
    // La IA lee el relato completo sin identificar y lo reparte en las secciones.
    let structuredStatus: "ai" | "rules" | "not_configured" | "error" = isClinicalAiConfigured() ? "rules" : "not_configured";
    if (isClinicalAiConfigured()) {
      const template = v.manifest.templates.find((t) => t.id === plan.templateId);
      try {
        const structured = template
          ? await structureDictation(
              input.text,
              template.sections.map((sct) => ({ key: sct.key, label: sct.label })),
              {
                names: [subjectName, plan.subject.name].filter((n): n is string => Boolean(n)),
                documents: [context?.document, plan.subject.document].filter((d): d is string => Boolean(d)),
                phones: [context?.phone, plan.subject.phone].filter((d): d is string => Boolean(d)),
                familyContact: context?.familyContact,
              },
            )
          : null;
        if (structured) {
          plan = interpretCapture(input.text, v.manifest, v.adapter, { ...ctx, templateId: plan.templateId, structured });
          structuredStatus = "ai";
        } else structuredStatus = "error";
      } catch {
        structuredStatus = "error";
      }
      if (structuredStatus === "error") plan.warnings.unshift("La IA no respondió: ordené el dictado con reglas. Revisá las secciones.");
    }
    // Sin texto clínico en la auditoría: solo el modo y el consentimiento declarado.
    await recordAudit({
      userId,
      action: "vertical.capture.interpret",
      entityType: "vertical",
      entityId: v.manifest.id,
      metadata: {
        captureMode: input.captureMode,
        consentConfirmed: input.consentConfirmed,
        structuredBy: structuredStatus,
        steps: plan.steps.length,
        redFlags: plan.safety.redFlags.filter((r) => !r.negated).length,
      },
    });
    res.set("Cache-Control", "no-store, private").json({ plan, structuredStatus });
  }),
);

const structureSchema = z.object({
  text: z.string().trim().min(2).max(8000),
  sections: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.string().trim().min(1).max(120) })).min(1).max(30),
  templateId: z.string().max(100).optional(),
  subjectId: z.string().uuid().optional(),
});

/**
 * Ordena un dictado dentro de una consulta ya abierta (cualquier plantilla,
 * también las propias): la IA reparte el relato sin identificar en las
 * secciones. Sin IA, usa las reglas si la plantilla es de la vertical.
 */
verticalsRouter.post(
  "/:id/structure",
  asyncHandler(async (req, res) => {
    const v = vertical(req.params.id!);
    const input = structureSchema.parse(req.body);
    const userId = req.userId!;
    const patient = await ownedPatientRecord(userId, input.subjectId);
    const keys = new Set(input.sections.map((sct) => sct.key));
    const rules = () => {
      if (!input.templateId || !v.manifest.templates.some((t) => t.id === input.templateId)) return null;
      const plan = interpretCapture(input.text, v.manifest, v.adapter, {
        now: new Date(),
        subjectId: input.subjectId,
        subjectName: patient?.name,
        templateId: input.templateId,
      });
      const record = plan.steps.find((st) => st.kind === "create_record");
      const fields = Object.fromEntries((record?.fields ?? []).filter((f) => keys.has(f.key)).map((f) => [f.key, f.value]));
      return Object.keys(fields).length ? fields : null;
    };
    let fields: Record<string, string> | null = null;
    let structuredStatus: "ai" | "rules" | "not_configured" | "error" = "not_configured";
    if (isClinicalAiConfigured()) {
      try {
        const structured = await structureDictation(input.text, input.sections, {
          names: patient?.name ? [patient.name] : [],
          documents: patient?.document ? [patient.document] : [],
          phones: patient?.phone ? [patient.phone] : [],
          familyContact: patient?.familyContact,
        });
        if (structured) {
          fields = Object.fromEntries(Object.entries(structured).map(([k, f]) => [k, f.value]));
          structuredStatus = "ai";
        } else structuredStatus = "error";
      } catch {
        structuredStatus = "error";
      }
    }
    if (!fields) {
      fields = rules();
      if (fields && structuredStatus === "not_configured") structuredStatus = "rules";
    }
    await recordAudit({
      userId,
      action: "vertical.structure",
      entityType: "vertical",
      entityId: v.manifest.id,
      metadata: { structuredBy: structuredStatus, sections: input.sections.length },
    });
    res.set("Cache-Control", "no-store, private").json({ fields, structuredStatus });
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

async function ownedPatientRecord(userId: string, subjectId: string | undefined) {
  if (!subjectId) return null;
  const row = await prisma.patient.findFirst({ where: { id: subjectId, userId } });
  if (!row) throw new HttpError(404, "Paciente no encontrado");
  return decryptClinical<PatientInput & { sex?: string; familyContact?: string }>(row.recordEncrypted, scope(userId, "patient", row.id));
}

const assistSchema = z.object({
  fields: z.record(z.string().max(10000)).refine((f) => Object.keys(f).length <= 30).default({}),
  text: z.string().max(8000).default(""),
  subjectId: z.string().uuid().optional(),
  /** Datos del paciente nuevo que todavía no tiene ficha (para desidentificar y contextualizar). */
  subject: z.object({ name: z.string().max(160).default(""), age: z.number().int().min(0).max(130).nullable().default(null), sex: z.string().max(1).default("") }).optional(),
  includeAi: z.boolean().default(true),
});

/**
 * Asistencia clínica en vivo mientras se carga la consulta:
 * recordatorios de guías (siempre, sin IA), prevención por edad y sexo,
 * conducta habitual del profesional y, si hay IA configurada, sugerencias
 * sobre el caso desidentificado. Devuelve exactamente lo que se envió.
 */
verticalsRouter.post(
  "/:id/assist",
  asyncHandler(async (req, res) => {
    const v = vertical(req.params.id!);
    const input = assistSchema.parse(req.body);
    const userId = req.userId!;
    const patient = await ownedPatientRecord(userId, input.subjectId);
    const ids = {
      names: [patient?.name, input.subject?.name].filter((n): n is string => Boolean(n)),
      documents: patient?.document ? [patient.document] : [],
      phones: patient?.phone ? [patient.phone] : [],
      familyContact: patient?.familyContact,
    };
    const fields = Object.fromEntries(
      Object.entries({ ...input.fields, ...(input.text ? { dictado: input.text } : {}) })
        .filter(([, value]) => value.trim())
        .map(([key, value]) => [key, deidentify(value, ids).text]),
    );
    const age = patient ? ageFrom(patient.birthDate) : (input.subject?.age ?? null);
    const sex = patient?.sex || input.subject?.sex || "";
    const history = patient ? deidentify(patient.history, ids).text : "";
    // La edad registrada también activa recordatorios (adulto mayor, pediatría).
    const ageContext = age === null ? "" : age >= 75 ? " adulto mayor" : age < 14 ? " control pediatrico" : "";
    const all = [Object.values(fields).join(" "), history, patient?.medication ?? "", ageContext].join(" ");
    const habits = habitsFor(await loadHabits(userId), all);
    const casePayload = {
      age,
      sex,
      allergies: patient?.allergies ?? "",
      medication: patient ? deidentify(patient.medication, ids).text : "",
      history,
      fields,
      habits: habits.flatMap((h) => h.treatments.slice(0, 2).map((t) => `${h.label}: ${t.text} (${t.count} veces)`)),
    };
    let ai = null;
    let aiStatus: "ok" | "not_configured" | "disabled" | "error" = "disabled";
    const hasContent = Object.values(fields).join(" ").trim().length >= 12;
    if (input.includeAi && hasContent) {
      if (!isClinicalAiConfigured()) aiStatus = "not_configured";
      else
        try {
          ai = await suggestForCase(casePayload);
          aiStatus = ai ? "ok" : "error";
        } catch {
          aiStatus = "error";
        }
    }
    await recordAudit({
      userId,
      action: "vertical.assist",
      entityType: "vertical",
      entityId: v.manifest.id,
      metadata: { aiStatus, provider: env.aiProvider, deidentified: true },
    });
    res.set("Cache-Control", "no-store, private").json({
      guidelines: matchGuidelines(all),
      prevention: preventiveReminders(age, sex),
      habits,
      ai,
      aiStatus,
      aiProvider: isClinicalAiConfigured() ? env.aiProvider : null,
      sent: casePayload,
    });
  }),
);

verticalsRouter.get(
  "/:id/habits",
  asyncHandler(async (req, res) => {
    vertical(req.params.id!);
    res.json({ habits: await loadHabits(req.userId!) });
  }),
);

verticalsRouter.post(
  "/:id/habits/learn",
  asyncHandler(async (req, res) => {
    vertical(req.params.id!);
    const input = z.object({ fields: z.record(z.string().max(10000)), subjectId: z.string().uuid().optional() }).parse(req.body);
    const patient = await ownedPatientRecord(req.userId!, input.subjectId);
    await learnFromFields(req.userId!, input.fields, {
      names: patient ? [patient.name] : [],
      documents: patient?.document ? [patient.document] : [],
      phones: patient?.phone ? [patient.phone] : [],
    });
    res.json({ habits: await loadHabits(req.userId!) });
  }),
);

verticalsRouter.delete(
  "/:id/habits/:key",
  asyncHandler(async (req, res) => {
    vertical(req.params.id!);
    const habits = (await loadHabits(req.userId!)).filter((h) => h.key !== req.params.key);
    await saveHabits(req.userId!, habits);
    res.json({ habits });
  }),
);
