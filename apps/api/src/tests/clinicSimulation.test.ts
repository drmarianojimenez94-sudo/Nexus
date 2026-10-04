import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { executePlan, fold, type ApiRequest, type PlanStep } from "@nexus/verticals";
import type { ClinicalCase } from "../lib/clinicalAssist.js";

/**
 * Simulación de consultorio: un médico usa Nexus con un lote de pacientes
 * escrito a ciegas (fixtures/clinic-pool.json). Recorre el flujo real de la
 * API — ficha, dictado, plan, confirmación, asistencia clínica, validación y
 * aprendizaje — y mide qué tan bien quedó todo anotado.
 *
 * La IA externa se reemplaza por un doble que registra exactamente qué se le
 * envía, para verificar que nunca reciba nombre, documento ni teléfono.
 */
const sentToAi: ClinicalCase[] = [];
vi.mock("../lib/clinicalAssist.js", () => ({
  isClinicalAiConfigured: () => true,
  suggestForCase: async (c: ClinicalCase) => {
    sentToAi.push(c);
    return { summary: "", considerations: [], workup: [], treatmentOptions: [], followupChecks: [], redFlags: [], questions: [] };
  },
}));

process.env.API_RATE_LIMIT = "100000";
const { createApp } = await import("../app.js");

interface Expect {
  reason?: string;
  present?: string;
  treatment?: string;
  observations?: string;
  guidelines?: string[];
  redFlags?: string[];
  followups?: { kind: string; inDays: number }[];
}
interface PoolPatient {
  id: string;
  patient: { name: string; document: string; birthDate: string; sex: string; phone: string; allergies: string; medication: string; history: string };
  visits: { dictation: string; expect: Expect }[];
}

const poolPath = join(__dirname, "fixtures/clinic-pool.json");
const pool: PoolPatient[] = existsSync(poolPath) ? JSON.parse(readFileSync(poolPath, "utf8")) : [];
const contains = (haystack: string | undefined, needle: string) => fold(haystack ?? "").includes(fold(needle));

describe.skipIf(pool.length === 0)("simulación de consultorio (lote ciego)", () => {
  it(`atiende ${pool.length} pacientes de punta a punta`, async () => {
    const app = createApp();
    const doctor = request.agent(app);
    await doctor.post("/auth/register").send({ name: "Dr. Simulación", email: "sim@example.test", password: "supersecret123" });
    const fetcher = async (r: ApiRequest) => {
      const res = await doctor[r.method.toLowerCase() as "get" | "post"](r.path).send(r.body ?? {});
      if (res.status >= 400) throw new Error(`${r.method} ${r.path} → ${res.status} ${JSON.stringify(res.body)}`);
      return res.body;
    };
    const fieldsTotal: Record<string, [number, number]> = { reason: [0, 0], present: [0, 0], treatment: [0, 0], observations: [0, 0] };
    let guidelinesHit = 0, guidelinesExpected = 0, flagsOk = 0, followupsOk = 0, followupsExpected = 0, saved = 0, validated = 0, visits = 0;
    const misses: string[] = [];
    const started = Date.now();

    for (const p of pool) {
      const created = await doctor.post("/clinical/patients").send(p.patient);
      expect(created.status, `${p.id} ficha`).toBe(201);
      const subjectId = created.body.patient.id as string;
      for (const [i, visit] of p.visits.entries()) {
        visits++;
        const tag = `${p.id}#${i + 1}`;
        const cap = await doctor.post("/verticals/medicine/capture").send({ text: visit.dictation, subjectId, templateId: "visit", captureMode: "dictated" });
        expect(cap.status, tag).toBe(200);
        const steps: PlanStep[] = cap.body.plan.steps;
        const record = steps.find((s) => s.kind === "create_record");
        const fields: Record<string, string> = Object.fromEntries((record?.fields ?? []).map((f) => [f.key, f.value]));
        for (const key of Object.keys(fieldsTotal) as (keyof Expect)[]) {
          const want = visit.expect[key] as string | undefined;
          if (!want) continue;
          fieldsTotal[key]![1]++;
          if (contains(fields[key], want)) fieldsTotal[key]![0]++;
          else misses.push(`${tag} ${key}: esperaba «${want}», quedó «${(fields[key] ?? "—").slice(0, 80)}»`);
        }
        const flags = (cap.body.plan.safety.redFlags as { id: string; negated: boolean }[]).filter((r) => !r.negated).map((r) => r.id).sort();
        if (JSON.stringify(flags) === JSON.stringify([...(visit.expect.redFlags ?? [])].sort())) flagsOk++;
        else misses.push(`${tag} alarmas: esperaba [${visit.expect.redFlags ?? []}], detectó [${flags}]`);
        const fus = steps.filter((s) => s.kind === "create_followup");
        for (const fu of visit.expect.followups ?? []) {
          followupsExpected++;
          const ok = fus.some((s) => s.request.body?.kind === fu.kind);
          if (ok) followupsOk++;
          else misses.push(`${tag} seguimiento ${fu.kind} faltante`);
        }
        const done = await executePlan(steps, fetcher);
        saved++;
        const assist = await doctor.post("/verticals/medicine/assist").send({ subjectId, fields });
        const gl = (assist.body.guidelines as { id: string }[]).map((g) => g.id);
        for (const g of visit.expect.guidelines ?? []) {
          guidelinesExpected++;
          if (gl.includes(g)) guidelinesHit++;
          else misses.push(`${tag} guía ${g} no detectada`);
        }
        // Revisión y validación: el médico vacía la transcripción y valida.
        const encounterId = record ? done[record.id] : undefined;
        if (encounterId) {
          const detail = await doctor.get(`/clinical/patients/${subjectId}`);
          const enc = detail.body.encounters.find((e: { id: string }) => e.id === encounterId);
          const upd = await doctor.put(`/clinical/encounters/${encounterId}`).send({ templateId: enc.templateId, occurredAt: enc.occurredAt, fields: enc.fields, dictation: "", version: enc.version });
          const fin = await doctor.post(`/clinical/encounters/${encounterId}/finalize`).send({ version: upd.body.encounter.version, confirmed: true });
          if (fin.status === 200) validated++;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500));

    // Privacidad: nada identificable llegó a la IA.
    const leaks = pool.flatMap((p) => {
      const blob = JSON.stringify(sentToAi);
      const tokens = [...p.patient.name.split(/\s+/).filter((w) => w.length >= 3), p.patient.document, p.patient.phone.replace(/\D/g, "").slice(-8)];
      return tokens.filter((t) => t && blob.includes(t)).map((t) => `${p.id}: «${t}»`);
    });
    const habits = (await doctor.get("/verticals/medicine/habits")).body.habits as unknown[];
    const day = (await doctor.get("/verticals/medicine/day")).body.brief;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
    const report = {
      pacientes: pool.length,
      consultas: visits,
      guardadas: saved,
      validadas: validated,
      campos: Object.fromEntries(Object.entries(fieldsTotal).map(([k, [ok, n]]) => [k, `${ok}/${n} (${pct(ok, n)}%)`])),
      guias: `${guidelinesHit}/${guidelinesExpected} (${pct(guidelinesHit, guidelinesExpected)}%)`,
      alarmas: `${flagsOk}/${visits} (${pct(flagsOk, visits)}%)`,
      seguimientos: `${followupsOk}/${followupsExpected} (${pct(followupsOk, followupsExpected)}%)`,
      fugasDeIdentidadHaciaIA: leaks.length,
      conductasAprendidas: habits.length,
      miDia: { borradores: day.drafts.length, seguimientosProximos: day.upcoming.length + day.dueToday.length },
      segundos: Math.round((Date.now() - started) / 1000),
      fallas: misses,
    };
    writeFileSync(join(__dirname, "../../../../docs/simulation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.warn(JSON.stringify({ ...report, fallas: misses.length }, null, 2));

    expect(leaks).toEqual([]);
    expect(saved).toBe(visits);
    expect(validated).toBe(visits);
    expect(habits.length).toBeGreaterThan(0);
  }, 300_000);
});
