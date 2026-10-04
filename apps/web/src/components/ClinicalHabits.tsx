"use client";
import type { Habit } from "@nexus/verticals";
import { useState } from "react";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

/** Conductas clínicas que Nexus aprendió de las consultas validadas. */
export function ClinicalHabits() {
  const { data, loading, error, reload } = useApiData<{ habits: Habit[] }>("/verticals/medicine/habits");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function forget(key: string) {
    setBusyKey(key);
    setActionError(null);
    try {
      await api.delete(`/verticals/medicine/habits/${encodeURIComponent(key)}`);
      await reload();
    } catch {
      setActionError("No pude borrarlo. Probá de nuevo.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="glass-panel flex flex-col gap-3 p-4" aria-labelledby="habits-title">
      <div>
        <h2 id="habits-title" className="text-lg font-semibold">Lo que Nexus aprendió de vos</h2>
        <p className="mt-1 text-sm text-nexus-muted">
          Nexus aprende de las consultas que validás o confirmás: para cada cuadro, qué conducta solés indicar. Lo usa
          para mostrarte «Tu conducta habitual» mientras cargás una consulta. Nunca guarda el nombre, el documento ni
          otros datos que identifiquen al paciente. Podés borrar lo que no quieras que recuerde.
        </p>
      </div>
      {loading && !data && <p className="text-sm text-nexus-muted">Cargando…</p>}
      {error && <p className="text-sm text-nexus-danger">No pude cargar lo aprendido.</p>}
      {actionError && <p role="alert" className="text-sm text-nexus-danger">{actionError}</p>}
      {data && data.habits.length === 0 && (
        <p className="text-sm text-nexus-muted">
          Todavía no aprendió nada. Validá una consulta con diagnóstico y tratamiento y va a aparecer acá.
        </p>
      )}
      {data && data.habits.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.habits.map((habit) => (
            <li key={habit.key} className="flex items-start justify-between gap-3 rounded-xl border border-nexus-border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{habit.label}</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {habit.treatments.slice(0, 3).map((t) => (
                    <li key={t.text} className="break-words">
                      {t.text}{" "}
                      <span className="text-xs text-nexus-muted">
                        · {t.count} {t.count === 1 ? "vez" : "veces"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => void forget(habit.key)}
                disabled={busyKey === habit.key}
                aria-label={`Olvidar ${habit.label}`}
                className="min-h-11 shrink-0 rounded-xl border border-nexus-danger/40 px-4 text-sm text-nexus-danger disabled:opacity-50"
              >
                {busyKey === habit.key ? "Borrando…" : "Olvidar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

