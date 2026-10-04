import type { VerticalManifest } from "./manifest";
import { dayBounds, zonedParts } from "./text";

export interface DayAppointment {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
}
export interface DayFollowup {
  id: string;
  title: string;
  dueAt: string;
  kind: string;
  subjectId: string;
  subjectName: string;
}
export interface DayDraft {
  id: string;
  subjectId: string;
  subjectName: string;
  updatedAt: string;
}
export interface DayInput {
  now: Date;
  appointments: DayAppointment[];
  followups: DayFollowup[];
  drafts: DayDraft[];
  /** Horario laboral local para detectar huecos. */
  workday?: { startHour: number; endHour: number };
}
export interface Suggestion {
  id: string;
  priority: 1 | 2 | 3;
  text: string;
  href?: string;
}
export interface DayBrief {
  verticalId: string;
  date: string;
  greeting: string;
  next: DayAppointment | null;
  appointments: DayAppointment[];
  overdue: Array<DayFollowup & { daysLate: number }>;
  dueToday: DayFollowup[];
  upcoming: DayFollowup[];
  drafts: Array<DayDraft & { hoursOld: number }>;
  freeSlots: Array<{ start: string; end: string; minutes: number }>;
  suggestions: Suggestion[];
  spoken: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildDayBrief(m: VerticalManifest, input: DayInput): DayBrief {
  const { now } = input;
  const tz = m.timezone;
  const { start, end } = dayBounds(now, tz);
  const v = m.vocabulary;
  const hhmm = (iso: string | Date) => new Intl.DateTimeFormat(m.locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const appointments = input.appointments
    .filter((a) => new Date(a.startAt) >= start && new Date(a.startAt) < end)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const next = appointments.find((a) => new Date(a.endAt ?? a.startAt) >= now) ?? null;
  const followups = [...input.followups].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const overdue = followups
    .filter((f) => new Date(f.dueAt) < start)
    .map((f) => ({ ...f, daysLate: Math.max(1, Math.ceil((start.getTime() - new Date(f.dueAt).getTime()) / 86_400_000)) }));
  const dueToday = followups.filter((f) => new Date(f.dueAt) >= start && new Date(f.dueAt) < end);
  const weekEnd = new Date(end.getTime() + 6 * 86_400_000);
  const upcoming = followups.filter((f) => new Date(f.dueAt) >= end && new Date(f.dueAt) < weekEnd);
  const drafts = input.drafts
    .map((d) => ({ ...d, hoursOld: Math.floor((now.getTime() - new Date(d.updatedAt).getTime()) / 3_600_000) }))
    .sort((a, b) => b.hoursOld - a.hoursOld);

  // Huecos de al menos 45 minutos dentro del horario laboral, desde ahora.
  const wd = input.workday ?? { startHour: 8, endHour: 20 };
  const dayStart = new Date(start.getTime() + wd.startHour * 3_600_000);
  const dayEnd = new Date(start.getTime() + wd.endHour * 3_600_000);
  const freeSlots: DayBrief["freeSlots"] = [];
  let cursor = new Date(Math.max(dayStart.getTime(), now.getTime()));
  for (const a of [...appointments, { id: "end", title: "", startAt: dayEnd.toISOString(), endAt: dayEnd.toISOString() }]) {
    const s = new Date(a.startAt);
    const e = new Date(a.endAt ?? new Date(s.getTime() + 30 * 60_000).toISOString());
    if (s > cursor) {
      const minutes = Math.round((s.getTime() - cursor.getTime()) / 60_000);
      if (minutes >= 45 && cursor < dayEnd) freeSlots.push({ start: cursor.toISOString(), end: s.toISOString(), minutes });
    }
    if (e > cursor) cursor = e;
  }

  const enabled = new Set(m.suggestions.map((s) => s.id));
  const suggestions: Suggestion[] = [];
  const add = (s: Suggestion) => enabled.has(s.id) && suggestions.push(s);
  if (overdue.length) {
    const worst = overdue.reduce((a, b) => (b.daysLate > a.daysLate ? b : a));
    add({
      id: "overdue-followups",
      priority: 1,
      text: `Tenés ${plural(overdue.length, `${v.followup.singular} vencido`, `${v.followup.plural} vencidos`)}. Empezá por ${worst.subjectName}: «${worst.title}» (hace ${plural(worst.daysLate, "día", "días")}).`,
      href: m.routes.followups,
    });
  }
  const results = [...overdue, ...dueToday].filter((f) => f.kind === "RESULT");
  if (results.length)
    add({ id: "results-to-review", priority: 1, text: `Revisá ${plural(results.length, "resultado pendiente", "resultados pendientes")}: ${results.slice(0, 3).map((r) => r.subjectName).join(", ")}.`, href: m.routes.followups });
  const calls = [...overdue, ...dueToday].filter((f) => f.kind === "CALL");
  if (calls.length)
    add({ id: "calls-today", priority: 2, text: `Llamadas para hoy: ${calls.slice(0, 4).map((c) => c.subjectName).join(", ")}${calls.length > 4 ? ` y ${calls.length - 4} más` : ""}.`, href: m.routes.followups });
  const stale = drafts.filter((d) => d.hoursOld >= 24);
  if (stale.length)
    add({
      id: "stale-drafts",
      priority: 1,
      text: `${plural(stale.length, `borrador de ${v.record.singular} lleva`, `borradores de ${v.record.plural} llevan`)} más de un día sin validar. Revisalos para que la historia quede completa y firmada.`,
      href: m.routes.subject.replace(":id", stale[0]!.subjectId),
    });
  else if (drafts.length)
    add({ id: "stale-drafts", priority: 2, text: `Te ${drafts.length === 1 ? "queda" : "quedan"} ${plural(drafts.length, "borrador", "borradores")} de hoy por validar.`, href: m.routes.subject.replace(":id", drafts[0]!.subjectId) });
  const pending = overdue.length + dueToday.length + drafts.length;
  const slot = freeSlots[0];
  if (slot && pending)
    add({ id: "free-slot", priority: 2, text: `Tenés libre de ${hhmm(slot.start)} a ${hhmm(slot.end)}: buen momento para ${plural(pending, "pendiente", "pendientes")}.` });
  if (appointments.length >= 16)
    add({ id: "overload", priority: 2, text: `Agenda cargada: ${appointments.length} ${v.appointment.plural}. Considerá reservar un bloque para pendientes y descanso.` });
  if (!appointments.length)
    add({ id: "empty-day", priority: 3, text: `No hay ${v.appointment.plural} cargados para hoy${pending ? `: ideal para ponerte al día con ${plural(pending, "pendiente", "pendientes")}` : ""}.`, href: m.routes.calendar });
  if (next) add({ id: "next-appointment", priority: 3, text: `Próximo: ${hhmm(next.startAt)} — ${next.title}.`, href: m.routes.calendar });
  suggestions.sort((a, b) => a.priority - b.priority);

  const hour = zonedParts(now, tz).hour;
  const greeting = hour < 12 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const date = new Intl.DateTimeFormat(m.locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);
  const spoken = [
    `${greeting}. Hoy, ${date}, tenés ${plural(appointments.length, v.appointment.singular, v.appointment.plural)}.`,
    next ? `El próximo es a las ${hhmm(next.startAt)}.` : "",
    overdue.length ? `${plural(overdue.length, `${v.followup.singular} vencido`, `${v.followup.plural} vencidos`)}.` : "",
    dueToday.length ? `${plural(dueToday.length, `${v.followup.singular} para hoy`, `${v.followup.plural} para hoy`)}.` : "",
    drafts.length ? `${plural(drafts.length, "borrador", "borradores")} por validar.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { verticalId: m.id, date, greeting, next, appointments, overdue, dueToday, upcoming, drafts, freeSlots, suggestions, spoken };
}
