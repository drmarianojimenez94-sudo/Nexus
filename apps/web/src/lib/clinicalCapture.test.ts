import { describe, expect, it, vi } from "vitest";
import { executePlan, type PlanStep } from "@nexus/verticals";
import { apiFetcher, bindSubject, needsSubject, remainingSteps } from "./clinicalCapture";

const step = (id: string, extra: Partial<PlanStep> = {}): PlanStep => ({
  id,
  kind: "create_task",
  summary: id,
  permissionLevel: 2,
  request: { method: "POST", path: "/tasks", body: { title: id } },
  resultIdPath: "id",
  evidence: [],
  warnings: [],
  dependsOn: [],
  ...extra,
});
const record = (bindTo: string) =>
  step("record", {
    kind: "create_record",
    request: { method: "POST", path: "/clinical/patients/:subjectId/encounters", body: { templateId: "soap" } },
    bind: { "path.:subjectId": bindTo },
    resultIdPath: "encounter.id",
  });
const followup = (bindTo: string) =>
  step("followup", {
    kind: "create_followup",
    request: { method: "POST", path: "/clinical/followups", body: { title: "Control" } },
    bind: { "body.patientId": bindTo },
  });

describe("bindSubject", () => {
  it("fills the chosen patient in path and body and clears the pending bind", () => {
    const steps = [record("$subject"), followup("$subject"), step("task")];
    expect(needsSubject(steps)).toBe(true);
    const bound = bindSubject(steps, "p-1");
    expect(needsSubject(bound)).toBe(false);
    expect(bound[0]!.request.path).toBe("/clinical/patients/p-1/encounters");
    expect(bound[1]!.request.body).toMatchObject({ patientId: "p-1", title: "Control" });
    expect(bound[2]).toBe(steps[2]);
    // No muta el plan original.
    expect(steps[0]!.request.path).toContain(":subjectId");
  });
});

describe("remainingSteps", () => {
  it("retries an ambiguous lookup with the chosen candidate and skips completed steps", async () => {
    const find = step("find", { kind: "find_subject", request: { method: "GET", path: "/clinical/patients?q=ana" }, listPath: "patients" });
    const steps = [find, step("appt"), { ...record("$find"), dependsOn: ["find"] }];
    const retry = remainingSteps(steps, { appt: "e-1" }, { find: "p-2" });
    expect(retry.map((s) => s.id)).toEqual(["record"]);
    expect(retry[0]!.dependsOn).toEqual([]);
    const fetcher = vi.fn().mockResolvedValue({ encounter: { id: "enc-9" } });
    expect(await executePlan(retry, fetcher)).toEqual({ record: "enc-9" });
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ path: "/clinical/patients/p-2/encounters" }));
  });
  it("keeps an unresolved $subject pending", () => {
    const retry = remainingSteps([step("done"), followup("$subject")], { done: "t-1" });
    expect(needsSubject(retry)).toBe(true);
  });
});

describe("apiFetcher", () => {
  it("maps plan requests to the api client", async () => {
    const client = { get: vi.fn().mockResolvedValue("g"), post: vi.fn().mockResolvedValue("p"), put: vi.fn(), patch: vi.fn() };
    const fetcher = apiFetcher(client);
    expect(await fetcher({ method: "GET", path: "/x" })).toBe("g");
    expect(await fetcher({ method: "POST", path: "/y", body: { a: 1 } })).toBe("p");
    expect(client.post).toHaveBeenCalledWith("/y", { a: 1 });
  });
});
