import type { Prisma } from "@prisma/client";
import { deidentify, learnHabit, type Habit, type Identifiers } from "@nexus/verticals";
import { prisma } from "./prisma.js";

export const HABITS_KEY = "clinical_habits";

export async function loadHabits(userId: string, db: Prisma.TransactionClient = prisma): Promise<Habit[]> {
  const row = await db.preference.findUnique({ where: { userId_key: { userId, key: HABITS_KEY } } });
  return Array.isArray(row?.value) ? (row.value as unknown as Habit[]) : [];
}

export async function saveHabits(userId: string, habits: Habit[], db: Prisma.TransactionClient = prisma) {
  const value = habits as unknown as Prisma.InputJsonValue;
  await db.preference.upsert({
    where: { userId_key: { userId, key: HABITS_KEY } },
    create: { userId, key: HABITS_KEY, value },
    update: { value },
  });
}

/** Diagnóstico y conducta de una consulta, ya sin identificadores. */
export function assessmentAndTreatment(fields: Record<string, string>, ids: Identifiers) {
  const pick = (...keys: string[]) => keys.map((k) => fields[k]?.trim()).find(Boolean) ?? "";
  return {
    assessment: deidentify(pick("assessment", "diagnosis", "reason", "problems"), ids).text,
    treatment: deidentify(pick("treatment", "plan", "instructions", "interventions"), ids).text,
  };
}

/** Aprende la conducta del profesional (best effort: nunca rompe el flujo clínico). */
export async function learnFromFields(userId: string, fields: Record<string, string>, ids: Identifiers) {
  try {
    const { assessment, treatment } = assessmentAndTreatment(fields, ids);
    if (!assessment || !treatment) return;
    await saveHabits(userId, learnHabit(await loadHabits(userId), { assessment, treatment }));
  } catch {
    console.error("No se pudo actualizar el aprendizaje clínico");
  }
}
