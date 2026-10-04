/**
 * Utilidades de texto y fechas en español, sin dependencias.
 *
 * `fold` conserva la longitud del texto para que los índices encontrados en
 * la versión normalizada sirvan como evidencia sobre el texto original.
 */
export function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD")[0] ?? ch;
    // Caracteres fuera del BMP ocupan dos unidades: se reemplazan por dos espacios.
    out += ch.length === 2 ? "  " : base.toLowerCase();
  }
  return out;
}

export interface Span {
  start: number;
  end: number;
  text: string;
}
export const span = (source: string, start: number, end: number): Span => ({ start, end, text: source.slice(start, end) });

/**
 * Divide en oraciones conservando posiciones. El punto entre dígitos
 * (DNI 30.123.456, 37.5 °C) y en abreviaturas comunes no corta.
 */
export function sentences(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push(span(text, start + lead, start + lead + trimmed.length));
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const isBreak =
      ch === ";" ||
      ch === "\n" ||
      ch === "?" ||
      ch === "!" ||
      (ch === "." && !(/\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) && !/\b(?:dr|dra|sr|sra|nro|tel|cel|aprox|hs)$/i.test(text.slice(Math.max(0, i - 6), i)));
    if (isBreak) {
      push(i);
      start = i + 1;
    }
  }
  push(text.length);
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30,
};
export const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).join("|");
export function toNumber(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { year: +get("year"), month: +get("month"), day: +get("day"), hour: +get("hour") % 24, minute: +get("minute"), weekday: wd };
}

/** Convierte una fecha-hora de pared en la zona indicada a un instante UTC. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += target - asUtc;
  }
  return new Date(guess);
}

/** Inicio y fin del día local que contiene `now`. */
export function dayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  const p = zonedParts(now, timeZone);
  const start = zonedToUtc(p.year, p.month, p.day, 0, 0, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, timeZone);
  return { start, end };
}

export interface ResolvedWhen {
  /** Instante UTC. Si no hubo hora explícita, `defaultHour` local. */
  at: Date;
  hasTime: boolean;
  /** Días calendario desde hoy (local). */
  inDays: number;
  span: Span;
}

/**
 * Busca una expresión temporal dentro de `folded` (texto ya normalizado con
 * `fold`). Entiende: hoy, mañana, pasado mañana, días de la semana, "en N
 * días/semanas/meses", "dentro de…", "15/10", "15 de octubre", y una hora.
 */
export function resolveWhen(source: string, folded: string, now: Date, timeZone: string, defaultHour = 9): ResolvedWhen | null {
  const today = zonedParts(now, timeZone);
  let offsetDays: number | null = null;
  let explicit: { year: number; month: number; day: number } | null = null;
  let start = -1;
  let end = -1;
  const take = (m: RegExpExecArray) => {
    start = m.index;
    end = m.index + m[0].length;
  };
  let m: RegExpExecArray | null;
  // "en 2 semanas", "dentro de 10 días", "en 48 horas", "ctrl 15 d".
  const relRe = new RegExp(`\\b(?:en|dentro\\s+de|a|ctrl\\.?|control)\\s+(\\d+|${NUMBER_WORD_PATTERN})\\s*(dias|dia|d|semanas|semana|sem|meses|mes|horas|hs)\\b`, "g");
  let rel: RegExpExecArray | null = null;
  for (let r = relRe.exec(folded); r; r = relRe.exec(folded)) {
    if (/^h/.test(r[2]!) && (toNumber(r[1]!) ?? 0) < 24) continue;
    rel = r;
    break;
  }
  if (rel) {
    const n = toNumber(rel[1]!) ?? 0;
    const unit = rel[2]!;
    offsetDays = unit === "d" || unit.startsWith("dia") ? n : unit.startsWith("sem") ? n * 7 : /^h/.test(unit) ? Math.round(n / 24) : null;
    if (unit.startsWith("mes")) {
      const d = new Date(Date.UTC(today.year, today.month - 1 + n, today.day));
      explicit = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    }
    take(rel);
  } else if ((m = /\bpasado\s+manana\b/.exec(folded))) {
    offsetDays = 2;
    take(m);
  } else if ((m = /\b(?:hoy|esta\s+(?:tarde|manana|noche))\b/.exec(folded))) {
    offsetDays = 0;
    take(m);
  } else if ((m = /\bmanana\b/.exec(folded)) && !/\b(?:de|por|a)\s+la\s+manana\b/.test(folded.slice(Math.max(0, m.index - 8), m.index + 6))) {
    offsetDays = 1;
    take(m);
  } else if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(folded))) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.year;
    explicit = { year, month: +m[2]!, day: +m[1]! };
    take(m);
  } else if ((m = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTHS.join("|")})\\b`).exec(folded))) {
    const month = MONTHS.indexOf(m[2]!) + 1;
    let year = today.year;
    if (month < today.month || (month === today.month && +m[1]! < today.day)) year += 1;
    explicit = { year, month, day: +m[1]! };
    take(m);
  } else if ((m = new RegExp(`\\b(?:${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\b(?!\\s*(?::|hs|horas))`).exec(folded)) && +m[1]! >= 1 && +m[1]! <= 31) {
    // "el martes 13": manda el día del mes (próxima ocurrencia).
    const day = +m[1]!;
    const d = new Date(Date.UTC(today.year, today.month - 1 + (day < today.day ? 1 : 0), day));
    explicit = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    take(m);
  } else if ((m = new RegExp(`\\b(?:el\\s+|este\\s+|proximo\\s+|el\\s+proximo\\s+)?(${WEEKDAYS.join("|")})(\\s+que\\s+viene|\\s+proximo)?\\b`).exec(folded))) {
    const wd = WEEKDAYS.indexOf(m[1]!);
    let diff = (wd - today.weekday + 7) % 7;
    if (diff === 0) diff = 7;
    offsetDays = diff;
    take(m);
  }
  if (offsetDays === null && !explicit) return null;
  const base = explicit ?? (() => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + (offsetDays ?? 0)));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  })();
  // Hora: se busca cerca de la fecha (misma cláusula, hasta 30 caracteres después).
  const window = folded.slice(Math.max(0, start - 30), Math.min(folded.length, end + 30));
  const windowOffset = Math.max(0, start - 30);
  let hour = defaultHour;
  let minute = 0;
  let hasTime = false;
  const timeRe = new RegExp(`(?:a\\s+las?\\s+|las\\s+)(\\d{1,2})(?:(?::|\\.)(\\d{2})|\\s+y\\s+(media|cuarto))?(?:\\s*(?:hs|h|horas)\\b)?(?:\\s+de\\s+la\\s+(tarde|noche|manana))?\\b|\\b(\\d{1,2}):(\\d{2})\\b|\\b(\\d{1,2})\\s*(?:hs|horas)\\b`);
  const t = timeRe.exec(window);
  if (t) {
    const h = Number(t[1] ?? t[5] ?? t[7]);
    const mm = t[2] ?? t[6];
    if (h <= 23) {
      hour = h;
      minute = mm ? Number(mm) : t[3] === "media" ? 30 : t[3] === "cuarto" ? 15 : 0;
      if ((t[4] === "tarde" || t[4] === "noche") && hour < 12) hour += 12;
      hasTime = true;
      start = Math.min(start, windowOffset + t.index);
      end = Math.max(end, windowOffset + t.index + t[0].length);
    }
  }
  const at = zonedToUtc(base.year, base.month, base.day, hour, minute, timeZone);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const inDays = Math.round((Date.UTC(base.year, base.month - 1, base.day) - todayUtc) / 86_400_000);
  return { at, hasTime, inDays, span: span(source, start, end) };
}
