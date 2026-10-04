import { HttpError } from "../middleware/errorHandler.js";
import { recordAudit } from "./audit.js";
import { GOOGLE_SCOPES } from "./googleCalendar.js";
import { draftRaw, googleJSON, sendConfirmation, workspaceToken } from "./googleWorkspace.js";

const gmail = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  /** Presentes solo si quedó guardado en Gmail y puede enviarse con confirmación. */
  id?: string;
  confirmationToken?: string;
  connected: boolean;
  note?: string;
}

/** "Pedro" → pedro@… usando Google Contacts, si está conectado. */
export async function resolveRecipient(userId: string, to: string): Promise<{ address: string | null; candidates: string[] }> {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) return { address: to.trim(), candidates: [] };
  try {
    const token = await workspaceToken(userId, GOOGLE_SCOPES.contacts);
    const params = new URLSearchParams({ query: to, readMask: "names,emailAddresses", pageSize: "5" });
    const data = (await googleJSON(token, `https://people.googleapis.com/v1/people:searchContacts?${params}`)) as {
      results?: { person: { names?: { displayName: string }[]; emailAddresses?: { value: string }[] } }[];
    };
    const found = (data.results ?? []).flatMap((r) => (r.person.emailAddresses ?? []).map((e) => `${r.person.names?.[0]?.displayName ?? ""} <${e.value}>`));
    return { address: found.length === 1 ? found[0]! : null, candidates: found };
  } catch {
    return { address: null, candidates: [] };
  }
}

/**
 * Prepara el mail como borrador en Gmail. Nunca envía: el envío requiere la
 * confirmación explícita del usuario (POST /google-workspace/drafts/:id/send).
 */
export async function prepareEmail(userId: string, draft: { to: string; subject: string; body: string }): Promise<EmailDraft> {
  const { address, candidates } = await resolveRecipient(userId, draft.to);
  if (!address)
    return {
      ...draft,
      connected: false,
      note: candidates.length > 1 ? `Encontré varios contactos: ${candidates.join(", ")}. Decime a cuál.` : "No encontré la dirección de correo: decímela o conectá tus contactos de Google.",
    };
  try {
    const token = await workspaceToken(userId, GOOGLE_SCOPES.gmailCompose);
    const created = (await googleJSON(token, `${gmail}/drafts`, {
      method: "POST",
      body: JSON.stringify({ message: { raw: draftRaw({ ...draft, to: address }) } }),
    })) as { id: string };
    const stored = (await googleJSON(token, `${gmail}/drafts/${encodeURIComponent(created.id)}?format=raw`)) as { message?: { raw?: string } };
    if (!stored.message?.raw) throw new HttpError(502, "Gmail no confirmó el borrador.");
    await recordAudit({ userId, action: "connector.gmail.draft.create", entityType: "gmail_draft", entityId: created.id, metadata: { via: "assistant" } });
    return { ...draft, to: address, id: created.id, confirmationToken: sendConfirmation(userId, created.id, stored.message.raw), connected: true };
  } catch (err) {
    return { ...draft, to: address, connected: false, note: err instanceof HttpError ? err.message : "No se pudo guardar el borrador en Gmail." };
  }
}

/** Copia un evento a Google Calendar si el permiso de escritura está concedido. */
export async function pushGoogleEvent(userId: string, event: { title: string; startAt: Date; endAt?: Date | null }): Promise<boolean> {
  try {
    const token = await workspaceToken(userId, GOOGLE_SCOPES.calendarEvents);
    const end = event.endAt ?? new Date(event.startAt.getTime() + 30 * 60_000);
    await googleJSON(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({ summary: event.title, start: { dateTime: event.startAt.toISOString() }, end: { dateTime: end.toISOString() } }),
    });
    return true;
  } catch {
    return false;
  }
}
