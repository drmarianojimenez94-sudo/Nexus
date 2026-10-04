import { fold } from "@nexus/verticals";
import { api, ApiError } from "./api";

/** Respuesta de `POST /assistant/interpret` (apps/api/src/routes/assistant.ts). */
export interface InterpretResult {
  speak: string;
  navigateTo?: string;
  target?: string;
  alarm?: { at: string; title: string };
  event?: { id: string; title: string; startAt: string; endAt: string | null; google: boolean };
  emailDraft?: { to: string; subject: string; body: string; id?: string; confirmationToken?: string; connected: boolean; note?: string };
  handoff?: { vertical: string; text: string };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Pantalla nativa a la que lleva un pedido de navegación. */
export interface NativeRoute {
  pathname: "/home" | "/patients" | "/assistant" | "/day" | "/agenda" | "/today" | "/settings";
  params?: Record<string, string>;
  /** Confirmación corta que se dice al abrir. */
  spoken: string;
}

/** Traduce las rutas de la web que devuelve el servidor a las pestañas de la app. */
export function nativeRouteFor(path: string | undefined, handoffText?: string): NativeRoute | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (clean === "/patients/capture") return { pathname: "/assistant", params: handoffText ? { text: handoffText } : undefined, spoken: "Abriendo el dictado" };
  if (clean === "/patients/day") return { pathname: "/day", spoken: "Abriendo Mi día" };
  if (clean.startsWith("/patients")) return { pathname: "/patients", spoken: "Abriendo pacientes" };
  if (clean === "/calendar") return { pathname: "/agenda", spoken: "Abriendo la agenda" };
  if (clean === "/today") return { pathname: "/today", spoken: "Abriendo Today" };
  if (clean === "/settings") return { pathname: "/settings", spoken: "Abriendo ajustes" };
  return null;
}

/** Sin IA en el servidor (501): frases de navegación que se resuelven en el teléfono. */
export function fallbackRoute(text: string): NativeRoute | null {
  const t = fold(text);
  if (/\b(mi dia|resumen del dia|que tengo hoy|pendientes de hoy)\b/.test(t)) return nativeRouteFor("/patients/day");
  if (/\b(dict(ar|ado|o)|anotar|nueva consulta|cargar (una )?consulta)\b/.test(t)) return nativeRouteFor("/patients/capture");
  if (/\b(agenda|calendario|turnos)\b/.test(t)) return nativeRouteFor("/calendar");
  if (/\b(pacientes?|fichas?|historias? clinicas?)\b/.test(t)) return nativeRouteFor("/patients");
  if (/\b(ajustes|configuracion)\b/.test(t)) return nativeRouteFor("/settings");
  return null;
}

export const NO_AI_REPLY =
  "Todavía no tengo la IA configurada en el servidor. Mientras tanto puedo abrir pacientes, el dictado, Mi día o la agenda: decime cuál.";

/** Interpreta una frase. `null` cuando el servidor no tiene IA (501): usar `fallbackRoute`. */
export async function interpretUtterance(text: string, history: ChatTurn[]): Promise<InterpretResult | null> {
  try {
    return await api.post<InterpretResult>("/assistant/interpret", { text, history: history.slice(-12) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 501) return null;
    throw err;
  }
}

/** Envía el borrador de Gmail ya revisado. Solo tras el toque explícito en "Enviar". */
export function sendEmailDraft(id: string, confirmationToken: string) {
  return api.post<{ id: string }>(`/google-workspace/drafts/${encodeURIComponent(id)}/send`, { confirmed: true, confirmationToken });
}
