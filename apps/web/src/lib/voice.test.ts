import { describe, expect, it } from "vitest";
import { pickSpanishVoice, sortSpanishVoices, spanishRank, voiceQuality } from "./voice";

const v = (name: string, lang: string) => ({ name, lang });

describe("voice picking", () => {
  it("returns null when there is no Spanish voice", () => {
    expect(pickSpanishVoice([v("Samantha", "en-US"), v("Thomas", "fr-FR")])).toBeNull();
    expect(pickSpanishVoice([])).toBeNull();
  });
  it("prefers the regional accent at equal quality", () => {
    const voices = [v("Mónica", "es-ES"), v("Paulina", "es-MX"), v("Diego", "es-AR"), v("Juan", "es-US")];
    expect(pickSpanishVoice(voices)?.name).toBe("Diego");
    expect(pickSpanishVoice(voices.filter((x) => x.lang !== "es-AR"))?.name).toBe("Juan");
    expect(pickSpanishVoice([v("Mónica", "es-ES"), v("Paulina", "es-MX")])?.name).toBe("Paulina");
  });
  it("prefers natural-sounding voices over basic ones", () => {
    const voices = [
      v("Diego", "es-AR"),
      v("Google español", "es-ES"),
      v("Microsoft Elena Online (Natural) - Spanish (Argentina)", "es-AR"),
    ];
    expect(pickSpanishVoice(voices)?.name).toContain("Elena");
    expect(pickSpanishVoice(voices.slice(0, 2))?.name).toBe("Google español");
  });
  it("accepts underscores and Latin American Spanish", () => {
    expect(spanishRank("es_AR")).toBe(0);
    expect(spanishRank("es-419")).toBe(1);
    expect(spanishRank("es-CL")).toBeGreaterThan(spanishRank("es-ES"));
    expect(spanishRank("en-US")).toBe(-1);
    expect(pickSpanishVoice([v("Mónica", "es-ES"), v("Google español de Estados Unidos", "es_US")])?.name).toContain("Estados Unidos");
  });
  it("respects a manual choice", () => {
    const voices = [v("Paulina", "es-MX"), v("Siri Voice 2 (Enhanced)", "es-ES")];
    expect(pickSpanishVoice(voices, "Paulina")?.name).toBe("Paulina");
    expect(pickSpanishVoice(voices, "No existe")?.name).toBe("Siri Voice 2 (Enhanced)");
  });
  it("ranks quality keywords", () => {
    expect(voiceQuality("Microsoft Dalia Online (Natural)")).toBeGreaterThan(voiceQuality("Google español"));
    expect(voiceQuality("Paulina (Premium)")).toBeGreaterThan(voiceQuality("Google español"));
    expect(voiceQuality("Paulina")).toBe(0);
  });
  it("sorts Spanish voices for the settings list", () => {
    const sorted = sortSpanishVoices([v("Paulina", "es-MX"), v("Alex", "en-US"), v("Google español", "es-ES")]);
    expect(sorted.map((x) => x.name)).toEqual(["Google español", "Paulina"]);
  });
});
