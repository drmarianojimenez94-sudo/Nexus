import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

export interface WebSource {
  title: string;
  url: string;
}
export interface WebAnswer {
  speak: string;
  sources: WebSource[];
}

const SYSTEM =
  "Sos NEXUS, el asistente personal de un médico de Argentina. Buscá en internet y respondé la pregunta con datos actuales, " +
  "en español rioplatense, en 1 a 4 oraciones cortas para decir en voz alta: sin markdown, sin listas, sin enlaces en el texto. " +
  "Si la respuesta depende de la fecha, usá la fecha actual que te paso. Si no encontrás el dato, decilo.";

const WEATHER_CODES: Record<number, string> = {
  0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "nublado",
  45: "con niebla", 48: "con niebla helada", 51: "con llovizna débil", 53: "con llovizna", 55: "con llovizna intensa",
  56: "con llovizna helada", 57: "con llovizna helada intensa", 61: "con lluvia débil", 63: "con lluvia", 65: "con lluvia intensa",
  66: "con lluvia helada", 67: "con lluvia helada intensa", 71: "con nevadas débiles", 73: "con nieve", 75: "con nevadas intensas",
  77: "con granizo fino", 80: "con chaparrones débiles", 81: "con chaparrones", 82: "con chaparrones fuertes",
  85: "con nevadas", 86: "con nevadas fuertes", 95: "con tormentas", 96: "con tormentas y granizo", 99: "con tormentas fuertes y granizo",
};
const round = (n: unknown) => (typeof n === "number" ? Math.round(n) : null);

/**
 * Clima en tiempo real de cualquier ciudad con Open-Meteo (gratis, sin clave).
 * Devuelve null si no encuentra el lugar o el servicio no responde.
 */
export async function weatherFor(place: string): Promise<WebAnswer | null> {
  const query = place.trim() || "Buenos Aires";
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=es&format=json`,
    { signal: AbortSignal.timeout(6000) },
  );
  if (!geo.ok) return null;
  const found = ((await geo.json()) as { results?: Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }> }).results?.[0];
  if (!found) return null;
  const params = new URLSearchParams({
    latitude: String(found.latitude),
    longitude: String(found.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "1",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current?: Record<string, number>;
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
  };
  const c = data.current ?? {};
  const temp = round(c.temperature_2m);
  if (temp === null) return null;
  const feels = round(c.apparent_temperature);
  const max = round(data.daily?.temperature_2m_max?.[0]);
  const min = round(data.daily?.temperature_2m_min?.[0]);
  const rain = round(data.daily?.precipitation_probability_max?.[0]);
  const where = [found.name, found.admin1 && found.admin1 !== found.name ? found.admin1 : null, found.country].filter(Boolean).join(", ");
  const sky = WEATHER_CODES[c.weather_code ?? -1] ?? "";
  const parts = [
    `En ${where} hay ${temp} grados${sky ? ` y está ${sky}` : ""}.`,
    feels !== null && Math.abs(feels - temp) >= 2 ? `La sensación térmica es de ${feels}.` : "",
    max !== null && min !== null ? `Hoy, mínima de ${min} y máxima de ${max}.` : "",
    rain !== null && rain >= 20 ? `Probabilidad de lluvia: ${rain} por ciento.` : "",
  ];
  return { speak: parts.filter(Boolean).join(" "), sources: [{ title: "Open-Meteo", url: "https://open-meteo.com" }] };
}

/** Claude: web search del servidor (la variante con filtrado dinámico en los modelos que la tienen). */
async function anthropicSearch(question: string, now: Date): Promise<WebAnswer | null> {
  const client = new Anthropic({ apiKey: env.aiApiKey });
  const dynamic = /opus-(?:5|4-[678])|sonnet-(?:5|4-6)|fable/.test(env.aiModel);
  const response = await client.messages.create(
    {
      model: env.aiModel,
      max_tokens: 2000,
      system: `${SYSTEM} Fecha actual: ${now.toISOString()}.`,
      // El SDK instalado no tipa las herramientas del servidor; la API las acepta tal cual.
      tools: [
        { type: dynamic ? "web_search_20260209" : "web_search_20250305", name: "web_search", max_uses: 3 } as unknown as Anthropic.Tool,
      ],
      messages: [{ role: "user", content: question }],
    },
    { timeout: 30_000 },
  );
  if ((response.stop_reason as string) === "refusal") return null;
  const sources = new Map<string, WebSource>();
  let speak = "";
  for (const block of response.content) {
    if (block.type !== "text") continue;
    speak += block.text;
    const citations = (block as { citations?: Array<{ type?: string; url?: string; title?: string | null }> }).citations ?? [];
    for (const c of citations)
      if (c.type === "web_search_result_location" && c.url) sources.set(c.url, { title: c.title ?? c.url, url: c.url });
  }
  speak = speak.trim();
  return speak ? { speak, sources: [...sources.values()].slice(0, 4) } : null;
}

/** Gemini: respuesta con Búsqueda de Google (grounding) por la API nativa. */
async function geminiSearch(question: string, now: Date): Promise<WebAnswer | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.aiModel)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.aiApiKey ?? "" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM} Fecha actual: ${now.toISOString()}.` }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini search ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
    }>;
  };
  const candidate = data.candidates?.[0];
  const speak = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .flatMap((ch) => (ch.web?.uri ? [{ title: ch.web.title ?? ch.web.uri, url: ch.web.uri }] : []))
    .slice(0, 4);
  return speak ? { speak, sources } : null;
}

/** Pregunta abierta con datos actuales de internet (noticias, cotizaciones, horarios, resultados…). */
export async function answerFromWeb(question: string, now = new Date()): Promise<WebAnswer | null> {
  if (!env.aiApiKey || !question.trim()) return null;
  return env.aiProvider === "anthropic" ? anthropicSearch(question, now) : geminiSearch(question, now);
}
