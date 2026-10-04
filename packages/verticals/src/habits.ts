import { matchGuidelines } from "./guidelines";
import { fold } from "./text";

export interface HabitTreatment {
  text: string;
  count: number;
  lastUsed: string;
}
export interface Habit {
  key: string;
  label: string;
  treatments: HabitTreatment[];
}

const MAX_HABITS = 150;
const MAX_TREATMENTS = 6;

/** Clave estable del cuadro: una condición de las guías o el texto normalizado. */
export function habitKeys(assessment: string): Array<{ key: string; label: string }> {
  const guideline = matchGuidelines(assessment);
  if (guideline.length) return guideline.map((g) => ({ key: g.id, label: g.label }));
  const label = assessment.trim().replace(/\s+/g, " ").slice(0, 80);
  const key = fold(label).replace(/[^a-z0-9 ]/g, "").trim().split(" ").slice(0, 4).join("-");
  return key ? [{ key: `free:${key}`, label }] : [];
}

/**
 * Aprende de lo que el profesional valida: para cada cuadro, qué conducta
 * suele indicar. Es visible y borrable; nunca guarda datos que identifiquen
 * al paciente (el texto debe llegar ya desidentificado).
 */
export function learnHabit(habits: Habit[], input: { assessment: string; treatment: string; now?: Date }): Habit[] {
  const treatment = input.treatment.trim().replace(/\s+/g, " ").slice(0, 240);
  if (!input.assessment.trim() || treatment.length < 3) return habits;
  const now = (input.now ?? new Date()).toISOString();
  const next = habits.map((h) => ({ ...h, treatments: h.treatments.map((t) => ({ ...t })) }));
  for (const { key, label } of habitKeys(input.assessment)) {
    let habit = next.find((h) => h.key === key);
    if (!habit) {
      habit = { key, label, treatments: [] };
      next.push(habit);
    }
    const same = habit.treatments.find((t) => fold(t.text) === fold(treatment));
    if (same) {
      same.count++;
      same.lastUsed = now;
    } else habit.treatments.push({ text: treatment, count: 1, lastUsed: now });
    habit.treatments.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
    habit.treatments = habit.treatments.slice(0, MAX_TREATMENTS);
  }
  const lastUse = (h: Habit) => h.treatments.reduce((m, t) => (t.lastUsed > m ? t.lastUsed : m), "");
  return next.sort((a, b) => lastUse(b).localeCompare(lastUse(a))).slice(0, MAX_HABITS);
}

export function habitsFor(habits: Habit[], text: string): Habit[] {
  const keys = new Set(habitKeys(text).map((k) => k.key));
  const folded = fold(text);
  return habits.filter((h) => keys.has(h.key) || (h.key.startsWith("free:") && folded.includes(fold(h.label).slice(0, 30))));
}
