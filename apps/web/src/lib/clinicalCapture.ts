import { assignSubject, type ApiRequest, type Fetcher, type PlanStep } from "@nexus/verticals";

/** Clave de sessionStorage con el texto derivado del asistente general. */
export const CLINICAL_HANDOFF_KEY = "nexus.clinicalHandoff";

/** Reemplaza `$subject` por la ficha elegida (delegado al paquete de verticales). */
export function bindSubject(steps: PlanStep[], patientId: string): PlanStep[] {
  return assignSubject(steps, patientId);
}

/** ¿Algún paso necesita que el profesional elija la ficha antes de guardar? */
export function needsSubject(steps: PlanStep[]): boolean {
  return steps.some((s) => Object.values(s.bind ?? {}).includes("$subject"));
}

const SENTINEL = "$__pending_subject__";
const renameRef = (steps: PlanStep[], from: string, to: string) =>
  steps.map((s) =>
    s.bind && Object.values(s.bind).includes(from)
      ? { ...s, bind: Object.fromEntries(Object.entries(s.bind).map(([k, v]) => [k, v === from ? to : v])) }
      : s,
  );

/**
 * Reintento tras un error parcial: quita los pasos ya hechos (y el fallido si
 * se resuelve con `resolved`) y fija como literales los ids que esos pasos
 * produjeron, porque `executePlan` empieza cada corrida sin resultados previos.
 * `resolved` asigna un id a un paso que no lo produjo (p. ej. la ficha elegida
 * entre varios candidatos de una búsqueda ambigua).
 */
export function remainingSteps(
  steps: PlanStep[],
  completed: Record<string, string>,
  resolved: Record<string, string> = {},
): PlanStep[] {
  const known = { ...completed, ...resolved };
  let out = renameRef(
    steps.filter((s) => !(s.id in known)),
    "$subject",
    SENTINEL,
  );
  for (const [stepId, value] of Object.entries(known)) {
    out = assignSubject(renameRef(out, `$${stepId}`, "$subject"), value);
  }
  return renameRef(out, SENTINEL, "$subject").map((s) => ({
    ...s,
    dependsOn: s.dependsOn.filter((d) => !(d in known)),
  }));
}

type ApiLike = {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
};

/** Adapta el cliente `api` (cookies, X-Nexus-Owner, reintento 401) al ejecutor del plan. */
export function apiFetcher(client: ApiLike): Fetcher {
  return (req: ApiRequest) => {
    switch (req.method) {
      case "GET":
        return client.get<unknown>(req.path);
      case "POST":
        return client.post<unknown>(req.path, req.body);
      case "PUT":
        return client.put<unknown>(req.path, req.body);
      case "PATCH":
        return client.patch<unknown>(req.path, req.body);
    }
  };
}
