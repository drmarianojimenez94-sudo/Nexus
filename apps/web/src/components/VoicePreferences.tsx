"use client";

import { PREFERENCE_KEYS } from "@nexus/shared";
import { useState } from "react";
import { usePreferences } from "@/lib/usePreferences";

export function VoicePreferences() {
  const { preferences, loading, setPreference } = usePreferences();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const enabled = preferences?.[PREFERENCE_KEYS.VOICE_AUTO_START] !== false;
  return <section className="glass-panel p-4">
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
    <p className="mt-3 text-sm text-nexus-muted">El navegador puede solicitar permiso o un toque para activar el micrófono. La escucha se pausa al salir de la pantalla.</p>
    {error && <p role="alert" className="mt-2 text-sm text-nexus-danger">{error}</p>}
  </section>;
}
