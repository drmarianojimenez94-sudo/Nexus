import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedIntent } from "../lib/ai.js";

const interpretUtterance = vi.fn<(text: string, ctx: unknown) => Promise<ParsedIntent | null>>();
vi.mock("../lib/ai.js", () => ({ isAiConfigured: true, aiProvider: { interpretUtterance } }));
vi.mock("../lib/env.js", async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> };
  return { env: { ...real.env, aiProvider: "gemini", aiApiKey: "test-key", aiModel: "gemini-test" } };
});

const { createApp } = await import("../app.js");
const { weatherFor, answerFromWeb } = await import("../lib/webAnswer.js");
const app = createApp();
const realFetch = globalThis.fetch;
const intent = (p: Partial<ParsedIntent>): ParsedIntent => ({ intent: "conversation", title: "", when: null, target: null, spokenReply: "Lo busco.", ...p });

/** Responde las llamadas externas (Open-Meteo, Gemini) y deja pasar las locales de supertest. */
function fakeInternet(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!/open-meteo|googleapis|nominatim/.test(url)) return realFetch(input, init);
    return new Response(JSON.stringify(handler(url, init)), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}
const meteo = (url: string) =>
  url.includes("geocoding")
    ? { results: [{ name: "Nueva York", admin1: "Nueva York", country: "Estados Unidos", latitude: 40.71, longitude: -74.01 }] }
    : {
        current: { temperature_2m: 18.4, apparent_temperature: 15.2, weather_code: 61, relative_humidity_2m: 70, wind_speed_10m: 12 },
        daily: { temperature_2m_max: [21], temperature_2m_min: [12], precipitation_probability_max: [80] },
      };

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Nexus conectado a internet", () => {
  let agent: ReturnType<typeof request.agent>;
  beforeEach(async () => {
    interpretUtterance.mockReset();
    agent = request.agent(app);
    await agent.post("/auth/register").send({ name: "Mariano", email: `web-${Date.now()}-${Math.random()}@example.test`, password: "supersecret123" });
  });

  it("dice el clima real de cualquier ciudad", async () => {
    fakeInternet(meteo);
    const answer = await weatherFor("Nueva York");
    expect(answer?.speak).toBe(
      "En Nueva York, Estados Unidos hay 18 grados y está con lluvia débil. La sensación térmica es de 15. Hoy, mínima de 12 y máxima de 21. Probabilidad de lluvia: 80 por ciento.",
    );
  });

  it("responde «cómo está el clima en Nueva York» por voz", async () => {
    fakeInternet(meteo);
    interpretUtterance.mockResolvedValue(intent({ intent: "weather", title: "Nueva York" }));
    const res = await agent.post("/assistant/interpret").send({ text: "cómo está el clima en Nueva York" });
    expect(res.body.speak).toMatch(/^En Nueva York.*18 grados/);
    expect(res.body.sources[0].title).toBe("Open-Meteo");
  });

  it("usa la ubicación del teléfono para «¿cómo está el clima?» sin decir dónde", async () => {
    const urls: string[] = [];
    fakeInternet((url) => {
      urls.push(url);
      if (url.includes("nominatim")) return { address: { city: "Rosario", state: "Santa Fe", country: "Argentina" } };
      return meteo(url);
    });
    interpretUtterance.mockResolvedValue(intent({ intent: "weather", title: "" }));
    const res = await agent.post("/assistant/interpret").send({ text: "cómo está el clima", location: { lat: -32.95, lon: -60.65 } });
    expect(res.body.speak).toMatch(/^En Rosario hay 18 grados/);
    // Pronóstico por coordenadas, sin buscar ciudad por nombre; al modelo solo le llega la ciudad.
    expect(urls.some((u) => u.includes("geocoding-api"))).toBe(false);
    expect(urls.some((u) => u.includes("latitude=-32.95"))).toBe(true);
    expect(interpretUtterance.mock.calls[0]![1]).toMatchObject({ location: "Rosario, Santa Fe, Argentina" });
    expect(JSON.stringify(interpretUtterance.mock.calls[0]![1])).not.toContain("-32.95");
  });

  it("sin permiso de ubicación avisa que puede usarla", async () => {
    fakeInternet(meteo);
    interpretUtterance.mockResolvedValue(intent({ intent: "weather", title: "" }));
    const res = await agent.post("/assistant/interpret").send({ text: "cómo está el clima" });
    expect(res.body.needsLocation).toBe(true);
    expect(res.body.speak).toMatch(/No tengo tu ubicación/);
  });

  it("busca en internet con Google y devuelve las fuentes", async () => {
    let body: { tools?: unknown[]; contents?: Array<{ parts: Array<{ text: string }> }> } = {};
    fakeInternet((_url, init) => {
      body = JSON.parse(String(init?.body));
      return {
        candidates: [
          {
            content: { parts: [{ text: "El dólar blue cerró hoy a 1.200 pesos para la venta." }] },
            groundingMetadata: { groundingChunks: [{ web: { uri: "https://ejemplo.com/dolar", title: "ejemplo.com" } }] },
          },
        ],
      };
    });
    interpretUtterance.mockResolvedValue(intent({ intent: "web_search", title: "cotización del dólar blue hoy en Argentina" }));
    const res = await agent.post("/assistant/interpret").send({ text: "a cuánto está el blue" });
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.contents?.[0]?.parts[0]?.text).toBe("cotización del dólar blue hoy en Argentina");
    expect(res.body).toEqual({ speak: "El dólar blue cerró hoy a 1.200 pesos para la venta.", sources: [{ title: "ejemplo.com", url: "https://ejemplo.com/dolar" }] });
  });

  it("si internet no responde, lo dice en vez de inventar", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (/googleapis/.test(url)) throw new Error("offline");
      return realFetch(input, init);
    }) as typeof fetch;
    await expect(answerFromWeb("noticias de hoy")).rejects.toThrow();
    interpretUtterance.mockResolvedValue(intent({ intent: "web_search", title: "noticias de hoy" }));
    const res = await agent.post("/assistant/interpret").send({ text: "qué noticias hay hoy" });
    expect(res.body.speak).toBe("No pude consultar internet ahora. Probá de nuevo en un momento.");
  });
});
