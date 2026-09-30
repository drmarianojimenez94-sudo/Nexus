import { describe, it, expect } from "vitest";
import { accentFor } from "./theme";
describe("adaptive colors", () => {
  it("changes the home palette by local time and preserves section identity", () => {
    expect(accentFor("/today", 8, "adaptive")).toBe("gold");
    expect(accentFor("/today", 15, "adaptive")).toBe("cyan");
    expect(accentFor("/today", 21, "adaptive")).toBe("violet");
    expect(accentFor("/patients/1", 8, "adaptive")).toBe("green");
    expect(accentFor("/calendar", 21, "adaptive")).toBe("gold");
  });
  it("honors a fixed color and time-only mode", () => {
    expect(accentFor("/patients", 8, "violet")).toBe("violet");
    expect(accentFor("/patients", 8, "time")).toBe("gold");
  });
});
