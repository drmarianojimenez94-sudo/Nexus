import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../lib/env.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Voz neural opcional. Con VOICE_PROVIDER + VOICE_API_KEY los clientes
 * reproducen el audio de este endpoint; sin configurar, `GET /voice/status`
 * dice "device" y cada cliente usa la mejor voz en español de su sistema.
 */
export const voiceRouter = Router();
voiceRouter.use(authenticate);

const configured = env.voiceProvider !== "device" && Boolean(env.voiceApiKey);

voiceRouter.get("/status", (_req, res) => {
  res.json({ provider: configured ? env.voiceProvider : "device", configured });
});

const ttsSchema = z.object({ text: z.string().trim().min(1).max(1500) });

async function synthesize(text: string): Promise<Buffer> {
  const key = env.voiceApiKey!;
  const signal = AbortSignal.timeout(15_000);
  if (env.voiceProvider === "google") {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "es-US", name: env.voiceName ?? "es-US-Neural2-A" },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.05 },
      }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const body = (await res.json()) as { audioContent?: string };
    if (!body.audioContent) throw new Error("TTS sin audio");
    return Buffer.from(body.audioContent, "base64");
  }
  if (env.voiceProvider === "elevenlabs") {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.voiceName ?? "EXAVITQu4vr4xnSDxMaL")}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "xi-api-key": key, Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (env.voiceProvider === "openai") {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: env.voiceName ?? "nova",
        input: text,
        instructions: "Hablá en español rioplatense, tono cálido, claro y profesional, como un secretario.",
        response_format: "mp3",
      }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Proveedor de voz desconocido");
}

voiceRouter.post(
  "/tts",
  rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    if (!configured) throw new HttpError(501, "Voz neural no configurada: se usa la voz del dispositivo.");
    const { text } = ttsSchema.parse(req.body);
    try {
      const audio = await synthesize(text);
      res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store, private" }).send(audio);
    } catch {
      // No se registra el texto: puede contener datos de pacientes.
      throw new HttpError(502, "No se pudo generar la voz; se usa la del dispositivo.");
    }
  }),
);
