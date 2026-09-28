import { describe, expect, it } from "vitest";
import { detectCalendarConflicts, detectOverload, findMostAbandonedProject } from "../lib/proactivity.js";

function event(id: string, title: string, startAt: string, endAt: string | null) {
  return { id, title, startAt: new Date(startAt), endAt: endAt ? new Date(endAt) : null };
}

describe("detectCalendarConflicts", () => {
  it("finds no conflicts for a normal sequential day", () => {
    const events = [
      event("1", "Reunión", "2026-01-01T09:00:00Z", "2026-01-01T10:00:00Z"),
      event("2", "Almuerzo", "2026-01-01T12:00:00Z", "2026-01-01T13:00:00Z"),
    ];
    expect(detectCalendarConflicts(events)).toEqual([]);
  });

  it("flags two events that overlap", () => {
    const events = [
      event("1", "Reunión A", "2026-01-01T09:00:00Z", "2026-01-01T10:30:00Z"),
      event("2", "Reunión B", "2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"),
    ];
    const result = detectCalendarConflicts(events);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Reunión A");
    expect(result[0]).toContain("Reunión B");
  });

  it("catches a non-adjacent overlap under a long event", () => {
    const events = [
      event("1", "Bloque largo", "2026-01-01T09:00:00Z", "2026-01-01T17:00:00Z"),
      event("2", "Corto", "2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z"),
      event("3", "Choca con el bloque", "2026-01-01T16:00:00Z", "2026-01-01T18:00:00Z"),
    ];
    const result = detectCalendarConflicts(events);
    expect(result.some((m) => m.includes("Bloque largo") && m.includes("Choca con el bloque"))).toBe(true);
  });

  it("treats events with no end time as instants", () => {
    const events = [event("1", "A", "2026-01-01T09:00:00Z", null), event("2", "B", "2026-01-01T09:00:00Z", null)];
    expect(detectCalendarConflicts(events)).toEqual([]);
  });
});

describe("detectOverload", () => {
  it("says nothing under the threshold", () => {
    expect(detectOverload(5)).toBeNull();
  });

  it("flags six or more events", () => {
    expect(detectOverload(6)).toContain("6 eventos");
  });
});

describe("findMostAbandonedProject", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("ignores projects younger than the minimum age", () => {
    const projects = [{ name: "Nuevo", createdAt: new Date("2025-12-30T00:00:00Z"), lastTaskActivity: null }];
    expect(findMostAbandonedProject(projects, now)).toBeNull();
  });

  it("ignores old projects with recent task activity", () => {
    const projects = [
      {
        name: "Activo",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastTaskActivity: new Date("2025-12-30T00:00:00Z"),
      },
    ];
    expect(findMostAbandonedProject(projects, now)).toBeNull();
  });

  it("flags an old project with no recent activity", () => {
    const projects = [
      {
        name: "Abandonado",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastTaskActivity: new Date("2025-11-01T00:00:00Z"),
      },
    ];
    const result = findMostAbandonedProject(projects, now);
    expect(result).toContain("Abandonado");
  });

  it("reports only the single most stale project, not a list", () => {
    const projects = [
      { name: "Stale A", createdAt: new Date("2025-01-01T00:00:00Z"), lastTaskActivity: new Date("2025-10-01T00:00:00Z") },
      { name: "Stale B (peor)", createdAt: new Date("2025-01-01T00:00:00Z"), lastTaskActivity: new Date("2025-08-01T00:00:00Z") },
    ];
    const result = findMostAbandonedProject(projects, now);
    expect(result).toContain("Stale B");
    expect(result).not.toContain("Stale A");
  });
});
