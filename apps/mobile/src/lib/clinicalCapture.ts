import { executePlan, medicineVertical, type ApiRequest, type CapturePlan, type DayBrief } from "@nexus/verticals";
import { api } from "./api";

export const vertical = medicineVertical;

export type CaptureMode = "typed" | "dictated" | "ambient";

/** Plantilla por defecto del dictado: consulta (motivo, enfermedad actual, examen, diagnóstico, tratamiento, observaciones). */
export const DEFAULT_TEMPLATE_ID = "visit";

export function interpret(text: string, opts: { captureMode: CaptureMode; consentConfirmed: boolean; subjectId?: string; templateId?: string }) {
  return api.post<{ plan: CapturePlan }>(`/verticals/${vertical.id}/capture`, { text, ...opts }).then((r) => r.plan);
}

export function loadDay() {
  return api.get<{ brief: DayBrief }>(`/verticals/${vertical.id}/day`).then((r) => r.brief);
}

const fetcher = (r: ApiRequest) =>
  r.method === "GET" ? api.get(r.path) : r.method === "PATCH" ? api.patch(r.path, r.body) : r.method === "PUT" ? api.put(r.path, r.body) : api.post(r.path, r.body);

/** Ejecuta los pasos elegidos; devuelve el id creado por cada paso. */
export function confirmPlan(plan: CapturePlan, selected: string[]): Promise<Record<string, string>> {
  return executePlan(plan.steps, fetcher, selected);
}

export interface GuidelineReminder {
  id: string;
  label: string;
  checks: string[];
  approach: string[];
  sources: string[];
}
export interface HabitSuggestion {
  key: string;
  label: string;
  treatments: { text: string; count: number; lastUsed: string }[];
}
export interface AiSuggestions {
  summary: string;
  considerations: string[];
  workup: string[];
  treatmentOptions: { option: string; rationale: string; source: string }[];
  followupChecks: string[];
  redFlags: string[];
  questions: string[];
}
export interface AssistResult {
  guidelines: GuidelineReminder[];
  prevention: string[];
  habits: HabitSuggestion[];
  ai: AiSuggestions | null;
  aiStatus: "ok" | "not_configured" | "disabled" | "error";
  aiProvider: string | null;
  /** Exactamente lo que se envió a la IA, ya desidentificado. */
  sent: { age: number | null; sex: string; allergies: string; medication: string; history: string; fields: Record<string, string>; habits: string[] };
}

/** Asistente clínico: guías, prevención, conducta habitual y (si hay IA) sugerencias sobre el caso desidentificado. */
export function assist(input: { fields: Record<string, string>; subjectId?: string; subject?: { name: string; age: number | null; sex: string }; includeAi?: boolean }) {
  return api.post<AssistResult>(`/verticals/${vertical.id}/assist`, { includeAi: true, ...input });
}

/** Aprende la conducta habitual (diagnóstico → tratamiento) de lo que el profesional guardó. */
export function learnHabits(fields: Record<string, string>, subjectId?: string) {
  return api.post<{ habits: HabitSuggestion[] }>(`/verticals/${vertical.id}/habits/learn`, { fields, ...(subjectId ? { subjectId } : {}) });
}
