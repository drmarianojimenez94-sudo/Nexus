"use client";

import { useEffect, useState } from "react";
import {
  getPreferredVoiceName,
  getVoiceStatus,
  loadDeviceVoices,
  pickSpanishVoice,
  setPreferredVoiceName,
  sortSpanishVoices,
  speak,
  useVoiceMuted,
  type VoiceStatus,
} from "@/lib/voice";

const PROVIDERS: Record<VoiceStatus["provider"], string> = {
  device: "voz del dispositivo",
  google: "Google Cloud Text-to-Speech",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
};

/** Ajustes › Voz: qué voz usa Nexus para hablar y si la voz neural está activa. */
export function VoiceOutputPreferences() {
  const [muted, setMuted] = useVoiceMuted();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [chosen, setChosen] = useState("");
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChosen(getPreferredVoiceName() ?? "");
    void loadDeviceVoices().then((all) => {
      if (!cancelled) {
        setVoices(sortSpanishVoices(all));
        setChecked(true);
      }
    });
    void getVoiceStatus(true).then((s) => {
      if (!cancelled) setStatus(s);
    });
    const refresh = () => setVoices(sortSpanishVoices(window.speechSynthesis.getVoices()));
    if ("speechSynthesis" in window)
      window.speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => {
      cancelled = true;
      if ("speechSynthesis" in window)
        window.speechSynthesis.removeEventListener("voiceschanged", refresh);
    };
  }, []);

  const automatic = pickSpanishVoice(voices);
  const neural = !!status?.configured;

  return (
    <section className="glass-panel flex flex-col gap-3 p-4" aria-labelledby="voice-output-title">
      <h2 id="voice-output-title" className="text-lg">Voz</h2>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
        Nexus responde hablando («Abriendo calendario», respuestas del asistente, resumen de Mi día)
      </label>
      <p role="status" className={`rounded-xl border p-3 text-sm ${neural ? "border-nexus-cyan/50 text-nexus-cyan" : "border-nexus-border text-nexus-muted"}`}>
        {status === null
          ? "Comprobando la voz neural del servidor…"
          : neural
            ? `Voz neural activa: ${PROVIDERS[status.provider]}. Si falla, se usa la voz del dispositivo.`
            : "Voz neural: se activa configurando VOICE_PROVIDER y VOICE_API_KEY en el servidor. Mientras tanto se usa la voz del dispositivo elegida abajo."}
      </p>
      <label className="flex flex-col gap-2 text-sm">
        Voz del dispositivo
        <select
          value={chosen}
          onChange={(e) => {
            setChosen(e.target.value);
            setPreferredVoiceName(e.target.value || null);
          }}
          className="w-full rounded-xl border border-nexus-border bg-nexus-bg p-3 text-sm"
        >
          <option value="">
            Automática (la más natural){automatic ? ` · ${automatic.name}` : ""}
          </option>
          {voices.map((v) => (
            <option key={`${v.name}-${v.lang}`} value={v.name}>
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      </label>
      {checked && voices.length === 0 && (
        <p className="text-xs text-nexus-amber">
          Este navegador no ofrece voces en español. En iPhone podés descargar voces en Ajustes › Accesibilidad ›
          Contenido leído › Voces; en Windows, las voces «Natural» de Edge suenan mejor.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => speak("Hola, soy Nexus. Abriendo calendario. Tenés tres pacientes esta mañana.")}
          className="rounded-xl border border-nexus-cyan/40 px-4 py-2 text-sm text-nexus-cyan"
        >
          Probar voz
        </button>
      </div>
      <p className="text-xs text-nexus-muted">
        La elección de voz se guarda en este dispositivo. Las voces con «Natural», «Neural», «Premium» o «Siri» en el
        nombre suelen sonar más humanas.
      </p>
    </section>
  );
}
