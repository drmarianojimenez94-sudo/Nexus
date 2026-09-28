/**
 * Rule-based proactive detection for Today's ATTENTION panel (spec Fase 6
 * — "calidad sobre cantidad, nunca spam"). Deliberately not an AI call:
 * these are structural facts about the calendar/task data, not judgment
 * calls, so a plain rule gets them right every time at zero cost and zero
 * latency — same principle as the rule-based voice command router.
 */

export interface CalendarEventLike {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
}

/** Classic sweep over events sorted by start time — catches any overlap, not just adjacent pairs. */
export function detectCalendarConflicts(events: CalendarEventLike[]): string[] {
  const sorted = [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const messages: string[] = [];
  let runningEnd: { time: number; title: string } | null = null;

  for (const event of sorted) {
    const eventEnd = (event.endAt ?? event.startAt).getTime();
    if (runningEnd && event.startAt.getTime() < runningEnd.time) {
      messages.push(`"${runningEnd.title}" y "${event.title}" se superponen`);
    }
    if (!runningEnd || eventEnd > runningEnd.time) {
      runningEnd = { time: eventEnd, title: event.title };
    }
  }
  return messages;
}

const OVERLOAD_THRESHOLD = 6;

export function detectOverload(eventCount: number): string | null {
  if (eventCount < OVERLOAD_THRESHOLD) return null;
  return `Tenés ${eventCount} eventos hoy — día cargado, capaz conviene mover algo.`;
}

const ABANDONED_PROJECT_DAYS = 21;
const MIN_PROJECT_AGE_DAYS = 14;

export interface ProjectActivityLike {
  name: string;
  createdAt: Date;
  lastTaskActivity: Date | null;
}

/**
 * Flags at most one stale ACTIVE project per Today load — the most stale
 * one, not a list — so a backlog of old projects never turns into spam.
 * Skips projects younger than MIN_PROJECT_AGE_DAYS so brand-new ones
 * without tasks yet don't get flagged as "abandoned".
 */
export function findMostAbandonedProject(projects: ProjectActivityLike[], now: Date): string | null {
  let worst: { name: string; staleDays: number } | null = null;
  for (const project of projects) {
    const ageDays = (now.getTime() - project.createdAt.getTime()) / 86_400_000;
    if (ageDays < MIN_PROJECT_AGE_DAYS) continue;

    const lastActivity = project.lastTaskActivity ?? project.createdAt;
    const staleDays = Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000);
    if (staleDays >= ABANDONED_PROJECT_DAYS && (!worst || staleDays > worst.staleDays)) {
      worst = { name: project.name, staleDays };
    }
  }
  return worst ? `El proyecto "${worst.name}" no tiene movimiento hace ${worst.staleDays} días` : null;
}
