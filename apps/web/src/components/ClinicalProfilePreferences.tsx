"use client";

import { clinicalProfileSchema, PREFERENCE_KEYS, type ClinicalProfile } from "@nexus/shared";
import { useEffect, useState } from "react";
import { usePreferences } from "@/lib/usePreferences";
import { clinicalButton, clinicalInput } from "./ClinicalUi";

/** Especialidad y matrícula: se copian en cada consulta validada (Ley 26.529, art. 15 inc. c). */
export function ClinicalProfilePreferences() {
  const { preferences, loading, setPreference } = usePreferences();
  const [profile, setProfile] = useState<ClinicalProfile>({ specialty: "", license: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (loading || loaded) return;
    const parsed = clinicalProfileSchema.safeParse(preferences?.[PREFERENCE_KEYS.CLINICAL_PROFILE] ?? {});
    if (parsed.success) setProfile(parsed.data);
    setLoaded(true);
  }, [loading, loaded, preferences]);
  return (
    <section className="glass-panel p-4">
      <h2 className="mb-3 text-lg">Perfil profesional</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const parsed = clinicalProfileSchema.safeParse(profile);
          if (!parsed.success) {
            setStatus({ ok: false, text: parsed.error.issues[0]?.message ?? "Revisá los datos." });
            return;
          }
          setSaving(true);
          setStatus(null);
          try {
            await setPreference(PREFERENCE_KEYS.CLINICAL_PROFILE, parsed.data);
            setStatus({ ok: true, text: "Perfil guardado." });
          } catch {
            setStatus({ ok: false, text: "No pude guardar el perfil. Volvé a intentarlo." });
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={loading || saving} className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Especialidad
            <input
              className={clinicalInput}
              maxLength={120}
              autoComplete="off"
              value={profile.specialty}
              onChange={(e) => setProfile((p) => ({ ...p, specialty: e.target.value }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">
            Matrícula
            <input
              className={clinicalInput}
              maxLength={60}
              autoComplete="off"
              value={profile.license}
              onChange={(e) => setProfile((p) => ({ ...p, license: e.target.value }))}
            />
          </label>
        </fieldset>
        <p className="text-sm text-nexus-muted">
          Se copian en cada consulta que valides, junto con tu nombre, para identificar al
          profesional interviniente (Ley 26.529, art. 15 inc. c). Los cambios no modifican
          consultas ya validadas.
        </p>
        {status && (
          <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-nexus-cyan" : "text-nexus-danger"}`}>
            {status.text}
          </p>
        )}
        <button className={`${clinicalButton} self-start`} disabled={loading || saving}>
          {saving ? "Guardando…" : "Guardar perfil"}
        </button>
      </form>
    </section>
  );
}
