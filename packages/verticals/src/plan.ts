import type { Span } from "./text";

/**
 * Un plan de captura es una lista de llamadas a la API ya validadas por los
 * endpoints existentes. El intérprete nunca escribe: propone. El cliente
 * (web o nativo) muestra el plan, el profesional elige qué pasos confirmar y
 * `executePlan` los ejecuta en orden, resolviendo dependencias entre pasos
 * (p. ej. el id del paciente recién creado para la consulta).
 */
export type StepKind = "find_subject" | "create_subject" | "create_record" | "create_followup" | "create_appointment" | "create_task";

export interface ApiRequest {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: Record<string, unknown>;
}

export interface ProposedField {
  key: string;
  label: string;
  value: string;
  evidence: Span[];
  source: "rules" | "ai";
  requiresReview: true;
  provisional?: boolean;
}

export interface PlanStep {
  id: string;
  kind: StepKind;
  summary: string;
  permissionLevel: number;
  request: ApiRequest;
  /**
   * `body.<campo>` o `path.<marcador>` ← `$<stepId>` (id producido por ese
   * paso). Los adaptadores usan `$subject` y el intérprete lo reemplaza.
   */
  bind?: Record<string, string>;
  /** Ruta al id en la respuesta (`patient.id`). */
  resultIdPath: string;
  /** Para búsquedas: ruta a la lista de resultados, que debe tener 1 elemento. */
  listPath?: string;
  /** Para búsquedas: si no hay ninguna ficha, se crea con este pedido (paciente nuevo dictado). */
  createIfMissing?: Pick<PlanStep, "request" | "resultIdPath">;
  evidence: Span[];
  fields?: ProposedField[];
  warnings: string[];
  dependsOn: string[];
}

export interface VerticalAdapter {
  findSubject(query: string): Omit<PlanStep, "id" | "summary" | "evidence" | "warnings" | "dependsOn" | "kind" | "permissionLevel">;
  createSubject(data: { name: string; document?: string; phone?: string; allergies?: string; clientId: string }): Pick<PlanStep, "request" | "resultIdPath">;
  createRecord(data: { templateId: string; occurredAt: string; fields: Record<string, string>; dictation: string; clientId: string }): Pick<PlanStep, "request" | "resultIdPath" | "bind">;
  createFollowup(data: { title: string; kind: string; dueAt: string; clientId: string }): Pick<PlanStep, "request" | "resultIdPath" | "bind">;
  createAppointment(data: { title: string; startAt: string; endAt: string }): Pick<PlanStep, "request" | "resultIdPath">;
  createTask(data: { title: string; deadline?: string }): Pick<PlanStep, "request" | "resultIdPath">;
}

export type Fetcher = (request: ApiRequest) => Promise<unknown>;

export class PlanExecutionError extends Error {
  constructor(
    public code: "subject_not_found" | "ambiguous_subject" | "missing_dependency" | "request_failed",
    message: string,
    public stepId: string,
    public completed: Record<string, string>,
    public candidates: unknown[] = [],
  ) {
    super(message);
  }
}

export function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), value);
}

/**
 * Ejecuta los pasos seleccionados en orden. Devuelve los ids creados por
 * paso. Si un paso falla, informa qué quedó hecho: como cada escritura
 * lleva `clientId`, reintentar el mismo plan es idempotente.
 */
export async function executePlan(steps: PlanStep[], fetcher: Fetcher, selected?: Iterable<string>): Promise<Record<string, string>> {
  const chosen = selected ? new Set(selected) : new Set(steps.map((s) => s.id));
  const done: Record<string, string> = {};
  for (const step of steps) {
    if (!chosen.has(step.id)) continue;
    const body = step.request.body ? { ...step.request.body } : undefined;
    let path = step.request.path;
    for (const [field, ref] of Object.entries(step.bind ?? {})) {
      const source = ref.replace(/^\$/, "");
      const value = done[source];
      if (!value) throw new PlanExecutionError("missing_dependency", `El paso «${step.summary}» necesita confirmar antes el paso ${source}.`, step.id, done);
      if (field.startsWith("path.")) path = path.replace(field.slice(5), encodeURIComponent(value));
      else if (body) body[field.replace(/^body\./, "")] = value;
    }
    let response: unknown;
    try {
      response = await fetcher({ ...step.request, path, body });
    } catch (err) {
      throw new PlanExecutionError("request_failed", err instanceof Error ? err.message : String(err), step.id, done);
    }
    if (step.listPath) {
      const list = getPath(response, step.listPath);
      const items = Array.isArray(list) ? list : [];
      if (items.length === 0 && step.createIfMissing) {
        try {
          response = await fetcher(step.createIfMissing.request);
        } catch (err) {
          throw new PlanExecutionError("request_failed", err instanceof Error ? err.message : String(err), step.id, done);
        }
        const id = getPath(response, step.createIfMissing.resultIdPath);
        if (typeof id === "string") done[step.id] = id;
        continue;
      }
      if (items.length === 0) throw new PlanExecutionError("subject_not_found", "No encontré esa ficha. Revisá el nombre o creala como nueva.", step.id, done);
      if (items.length > 1) throw new PlanExecutionError("ambiguous_subject", "Hay más de una ficha con ese nombre. Elegí la correcta.", step.id, done, items);
      response = items[0];
    }
    const id = getPath(response, step.resultIdPath);
    if (typeof id === "string") done[step.id] = id;
  }
  return done;
}

/** Identificador v4 sin depender de `crypto.randomUUID` (no existe en todos los motores JS nativos). */
export function uuid(random: () => number = Math.random): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (random === Math.random && c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(random() * 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Asigna la ficha que eligió el profesional a los pasos que esperaban
 * `$subject` (no se identificó a la persona en el dictado o hubo varias).
 */
export function assignSubject(steps: PlanStep[], subjectId: string): PlanStep[] {
  return steps.map((step) => {
    const entries = Object.entries(step.bind ?? {});
    if (!entries.some(([, ref]) => ref === "$subject")) return step;
    let path = step.request.path;
    const body = step.request.body ? { ...step.request.body } : undefined;
    const bind: Record<string, string> = {};
    for (const [field, ref] of entries) {
      if (ref !== "$subject") bind[field] = ref;
      else if (field.startsWith("path.")) path = path.replace(field.slice(5), encodeURIComponent(subjectId));
      else if (body) body[field.replace(/^body\./, "")] = subjectId;
    }
    return { ...step, request: { ...step.request, path, body }, bind, warnings: step.warnings.filter((w) => !/^Elegí la ficha/.test(w)) };
  });
}
