import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

/**
 * Calendario del teléfono (expo-calendar). Nexus copia ahí sus turnos con
 * el mismo título que ya usa el servidor (iniciales del paciente, nunca
 * datos clínicos) y lee los próximos eventos para mostrarlos en Agenda.
 */

export interface PhoneEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  calendar: string;
}

const supported = Platform.OS === "ios" || Platform.OS === "android";

export async function ensureCalendarPermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Calendar.requestCalendarPermissions()).granted;
}

async function eventCalendars(): Promise<Calendar.ExpoCalendar[]> {
  return Platform.OS === "ios" ? Calendar.getCalendars(Calendar.EntityTypes.EVENT) : Calendar.getCalendars();
}

/** iPhone: el calendario por defecto. Android no tiene uno: el principal con escritura. */
async function writableCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === "ios") {
    try {
      return Calendar.getDefaultCalendarSync();
    } catch {
      // sin calendario por defecto: se elige uno con escritura
    }
  }
  const writable = (await eventCalendars()).filter((c) => c.allowsModifications);
  return writable.find((c) => c.isPrimary) ?? writable[0] ?? null;
}

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/** Agrega el evento al calendario del teléfono. Devuelve false si no hay permiso o calendario. */
export async function addToPhoneCalendar(event: { title: string; startAt: string; endAt?: string | null; notes?: string }): Promise<boolean> {
  try {
    if (!(await ensureCalendarPermission())) return false;
    const calendar = await writableCalendar();
    if (!calendar) return false;
    const start = new Date(event.startAt);
    const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + 30 * 60_000);
    await calendar.createEvent({
      title: event.title,
      startDate: start,
      endDate: end,
      notes: event.notes ?? "Agendado desde Nexus",
      alarms: [{ relativeOffset: -15 }],
    });
    return true;
  } catch {
    return false;
  }
}

/** Eventos del teléfono entre dos fechas (todas las cuentas). Vacío si no hay permiso. */
export async function listPhoneEvents(from: Date, to: Date): Promise<PhoneEvent[] | null> {
  try {
    if (!(await ensureCalendarPermission())) return null;
    const calendars = await eventCalendars();
    if (calendars.length === 0) return [];
    const names = new Map(calendars.map((c) => [c.id, c.title]));
    const events = await Calendar.listEvents(calendars, from, to);
    return events
      .map((e) => ({
        id: e.id,
        title: e.title || "(sin título)",
        startAt: toDate(e.startDate).toISOString(),
        endAt: e.endDate ? toDate(e.endDate).toISOString() : null,
        allDay: Boolean(e.allDay),
        calendar: names.get(e.calendarId) ?? "",
      }))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  } catch {
    return null;
  }
}
