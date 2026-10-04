"use client";

import { PREFERENCE_KEYS } from "@nexus/shared";
import { useCallback, useEffect, useState } from "react";
import { usePreferences } from "@/lib/usePreferences";
import { api } from "@/lib/api";

export function VoicePreferences() {
  const { preferences, loading, setPreference } = usePreferences();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [aiStatus, setAiStatus] = useState<"checking" | "configured" | "missing" | "error">("checking");
  const checkAI = useCallback(async () => {
    setAiStatus("checking");
    try {
      const result = await api.get<{ aiConfigured: boolean; provider?: string }>("/assistant/status");
      setProvider(result.provider ?? "gemini");
      setAiStatus(result.aiConfigured ? "configured" : "missing");
    } catch { setAiStatus("error"); }
  }, []);
  useEffect(() => { void checkAI(); }, [checkAI]);
  const enabled = preferences?.[PREFERENCE_KEYS.VOICE_AUTO_START] === true;
  return <><section className="glass-panel p-4">
    <h2 className="mb-3 text-lg">Voz de Nexus</h2>
    <label className="flex items-center gap-3 text-sm">
      <input type="checkbox" checked={enabled} disabled={loading || saving} onChange={async (event) => {
        setSaving(true); setError("");
        try { await setPreference(PREFERENCE_KEYS.VOICE_AUTO_START, event.target.checked); }
        catch { setError("No pude guardar el cambio. Volvé a intentarlo."); }
        finally { setSaving(false); }
      }} />
      Abrir el asistente de voz al entrar
    </label>
    <p className="mt-3 text-sm text-nexus-muted">El navegador puede solicitar permiso o un toque para activar el micrófono. La escucha sigue al abrir tus paneles y se pausa al dejar Nexus o al tocar ‘Pausar micrófono’.</p>
    {error && <p role="alert" className="mt-2 text-sm text-nexus-danger">{error}</p>}
  </section>
  <section className="glass-panel p-4">
    <h2 className="mb-3 text-lg">Inteligencia de Nexus</h2>
    <p role="status" className="text-sm">{aiStatus === "checking" ? "Comprobando el servidor…" : aiStatus === "configured" ? "El servidor tiene una clave de IA configurada." : aiStatus === "missing" ? "Falta configurar la clave de IA en el servidor." : "No pude consultar el servidor. Volvé a comprobarlo."}</p>
    <p className="mt-2 text-sm text-nexus-muted">El calendario y los paneles se abren sin IA. Para conversar y entender pedidos complejos, el servidor usa {provider === "anthropic" ? "Claude" : "Gemini"}.</p>
    {aiStatus !== "configured" && <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
      <li>Para usar Gemini, creá una clave en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-nexus-cyan underline">Google AI Studio</a> con tu cuenta de Google.</li>
      <li>En <a href="https://dashboard.render.com/" target="_blank" rel="noopener noreferrer" className="text-nexus-cyan underline">Render</a>, abrí el servicio de Nexus → Environment. Guardá la clave como <code>GEMINI_API_KEY</code>, elegí <code>AI_PROVIDER=gemini</code> y eliminá <code>AI_MODEL</code> o usá <code>gemini-3.5-flash-lite</code>.</li>
      <li>Elegí ‘Save and deploy’. Cuando termine, volvé acá y comprobá la configuración.</li>
    </ol>}
    {provider === "gemini" && <p className="mt-3 text-xs text-nexus-muted">Gemini ofrece un nivel gratuito con límites. En ese nivel Google puede usar los datos para mejorar sus productos: evitá información de pacientes u otros datos sensibles. Nexus no activa facturación ni cambia a un proveedor pago automáticamente.</p>}
    <p className="mt-3 text-xs text-nexus-muted">La clave se guarda solamente en el servidor. No la pegues en el chat ni en una variable pública. Este estado comprueba su presencia; pedile algo a Nexus para confirmar que funciona.</p>
    <button disabled={aiStatus === "checking"} onClick={() => void checkAI()} className="mt-3 rounded-xl border border-nexus-cyan/40 px-4 py-2 text-sm text-nexus-cyan disabled:opacity-50">Comprobar configuración</button>
  </section></>;
}
