"use client";
import { useState } from "react";
import { usePreferences } from "@/lib/usePreferences";
import { clinicalInput, ClinicalError } from "./ClinicalUi";
export function ThemePreferences() {
  const { preferences, setPreference } = usePreferences(),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <section className="glass-panel flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Colores de Nexus</h2>
      <p className="text-sm text-nexus-muted">
        En modo adaptativo, Pacientes es verde y Agenda dorada. El inicio es
        dorado por la mañana, cian por la tarde y violeta por la noche. Se
        conserva el diseño y el color de los avisos.
      </p>
      <label className="text-sm">
        Modo de color
        <select
          disabled={busy}
          className={`${clinicalInput} mt-2`}
          value={String(preferences?.theme_mode || "adaptive")}
          onChange={async (e) => {
            setBusy(true);
            setError(null);
            try {
              await setPreference("theme_mode", e.target.value);
            } catch {
              setError("No se pudo guardar el color");
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="adaptive">Adaptativo: sección y horario</option>
          <option value="time">Solo por horario</option>
          <option value="sections">Solo por sección</option>
          <option value="gold">Dorado fijo</option>
          <option value="green">Verde fijo</option>
          <option value="cyan">Cian fijo</option>
          <option value="violet">Violeta fijo</option>
        </select>
      </label>
      <ClinicalError message={error} />
    </section>
  );
}
