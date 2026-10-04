import { fold } from "@nexus/verticals";
import { router } from "expo-router";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { setPhoneAlarm } from "./alarm";
import { api, ApiError } from "./api";
import { addToPhoneCalendar } from "./phoneCalendar";
import { speak } from "./voice";

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
  if (clean === "/patients/capture")
    return { pathname: "/assistant", params: handoffText ? clinicalParams(handoffText) : undefined, spoken: handoffText ? "Armando la ficha" : "Abriendo el dictado" };
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

/**
 * Parámetros para abrir Dictar con un texto ya dicho y que arme la ficha
 * solo (`auto`). `nonce` hace que el mismo texto dictado dos veces vuelva a
 * procesarse.
 */
export function clinicalParams(text: string, subjectId?: string): Record<string, string> {
  return { text, auto: "1", nonce: String(Date.now()), ...(subjectId ? { subjectId } : {}) };
}

/* ───────────── Conversación con la secretaria (compartida) ───────────── */

export type EmailDraft = NonNullable<InterpretResult["emailDraft"]>;
export interface Turn extends ChatTurn {
  id: number;
}
interface SecretaryState {
  turns: Turn[];
  busy: boolean;
  draft: EmailDraft | null;
  notice: string | null;
}

let state: SecretaryState = { turns: [], busy: false, draft: null, notice: null };
let nextId = 1;
const listeners = new Set<() => void>();
function update(patch: Partial<SecretaryState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function push(role: Turn["role"], content: string) {
  update({ turns: [...state.turns, { id: nextId++, role, content }].slice(-20) });
}

/** Estado de la secretaria: lo usan Inicio y el botón global de micrófono. */
export function useSecretary() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function dismissDraft() {
  update({ draft: null });
}

/** Envía el borrador pendiente (solo tras el toque en «Enviar»). */
export async function sendPendingDraft(): Promise<boolean> {
  const draft = state.draft;
  if (!draft?.id || !draft.confirmationToken) return false;
  update({ notice: null });
  try {
    await sendEmailDraft(draft.id, draft.confirmationToken);
    update({ draft: null });
    push("assistant", "Mail enviado.");
    void speak("Listo, mail enviado.");
    return true;
  } catch (err) {
    update({ notice: err instanceof Error ? err.message : "No se pudo enviar el mail." });
    return false;
  }
}

const hhmm = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export interface SecretaryOutcome {
  spoken: string;
  route: NativeRoute | null;
  draft: EmailDraft | null;
}

/**
 * Pedido a la secretaria: interpreta en el servidor y resuelve en el
 * teléfono lo que propone (alarma en el Reloj o aviso con sonido, turno en
 * el calendario del teléfono, borrador de mail que solo se envía con tu
 * toque, navegación). Lo que responde, lo dice en voz.
 */
export async function handleUtterance(text: string): Promise<SecretaryOutcome | null> {
  const utterance = text.trim();
  if (!utterance) return null;
  const history: ChatTurn[] = state.turns.map(({ role, content }) => ({ role, content }));
  push("user", utterance);
  update({ busy: true, notice: null });
  let reply = "";
  const extras: string[] = [];
  let route: NativeRoute | null = null;
  let draft: EmailDraft | null = null;
  try {
    const result = await interpretUtterance(utterance, history);
    if (!result) {
      route = fallbackRoute(utterance);
      reply = route ? route.spoken : NO_AI_REPLY;
    } else {
      reply = result.speak;
      if (result.alarm) {
        const at = new Date(result.alarm.at);
        const how = await setPhoneAlarm(at, result.alarm.title);
        extras.push(
          how === "clock"
            ? "Te puse la alarma en el Reloj."
            : how === "notification"
              ? Platform.OS === "ios"
                ? `El iPhone no deja que otras apps creen alarmas en el Reloj: te programé un aviso con sonido a las ${hhmm(at)}.`
                : `Te programé un aviso con sonido para el ${at.toLocaleDateString("es-AR", { weekday: "long", day: "numeric" })} a las ${hhmm(at)}.`
              : "No pude programar la alarma en el teléfono; quedó como recordatorio en Nexus.",
        );
      }
      if (result.event) {
        const added = await addToPhoneCalendar({ title: result.event.title, startAt: result.event.startAt, endAt: result.event.endAt });
        extras.push(added ? "Agendado en tu calendario." : "Quedó agendado en Nexus; para copiarlo al teléfono dame permiso al calendario.");
      }
      if (result.emailDraft) {
        draft = result.emailDraft;
        update({ draft });
      }
      // Solo se navega cuando el pedido fue ir a algún lado o derivar al dictado clínico.
      if (result.handoff) route = nativeRouteFor("/patients/capture", result.handoff.text);
      else if (result.target) route = nativeRouteFor(result.navigateTo);
    }
  } catch (err) {
    reply = err instanceof Error && err.message ? `No pude resolverlo: ${err.message}` : "No pude comunicarme con Nexus. Revisá la conexión.";
  } finally {
    update({ busy: false });
  }
  const spoken = [reply, ...extras].filter(Boolean).join(" ");
  push("assistant", spoken);
  if (route) router.navigate({ pathname: route.pathname, params: route.params });
  void speak(spoken);
  return { spoken, route, draft };
}
