import { describe, expect, it } from "vitest";
import type { ClinicalEncounter, EncounterInput } from "@nexus/shared";
import { reconcileClinicalDraft } from "./ClinicalDraftConflict";
describe("explicit draft reconciliation", () => {
  it("copies local content only into known fields and preserves server-only fields", () => {
    const local: EncounterInput = {
      templateId: "old",
      occurredAt: "2026-09-30T10:00:00.000Z",
      fields: { reason: "Local edit", obsolete: "Do not import" },
      dictation: "Pending reviewed text",
    };
    const server = {
      templateId: "new",
      fields: { reason: "Server", exam: "Server exam" },
      template: { fields: [{ key: "reason" }, { key: "exam" }] },
    } as unknown as ClinicalEncounter;
    const result = reconcileClinicalDraft(local, server);
    expect(result).toEqual({
      ...local,
      templateId: "new",
      fields: { reason: "Local edit", exam: "Server exam" },
    });
    expect(server.fields.reason).toBe("Server");
  });
});
