"use client";

import type { Memory } from "@nexus/shared";
import Link from "next/link";
import { useState } from "react";
import { ClinicalHabits } from "@/components/ClinicalHabits";
import { DEFAULT_SILENCE_MS, getSilenceMs, setSilenceMs, SILENCE_OPTIONS } from "@/lib/dictation";
import { useApiData } from "@/lib/useApiData";

/**
 * «Lo que aprendí»: el cerebro de Nexus en un solo lugar, a la vista y
 * editable. Nada de lo que aprende es una caja negra.
 */
export default function BrainPage() {
  const memories = useApiData<{ memories: Memory[] }>("/memories");
  const [silence, setSilence] = useState(() => (typeof window === "undefined" ? DEFAULT_SILENCE_MS : getSilenceMs()));

  return (
    <div className="flex flex-col gap-4">
      <header className="glass-panel p-5">
        <p className="font-mono text-xs tracking-[0.3em] text-nexus-cyan">NEXUS · CEREBRO</p>
        <h1 className="mt-1 text-2xl font-semibold">🧠 Lo que aprendí de vos</h1>
        <p className="mt-2 text-sm text-nexus-muted">
          Nexus aprende de dos formas: de cada consulta que <strong>validás</strong> (qué indicás en cada cuadro) y de lo que le pedís
          que recuerde («recordá que…»). Todo se ve acá y lo podés borrar. Nunca guarda nombres ni documentos de pacientes en lo aprendido.
        </p>
      </header>

      <ClinicalHabits />

      <section className="glass-panel flex flex-col gap-3 p-4" aria-labelledby="memories-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="memories-title" className="text-lg font-semibold">Lo que me pediste que recuerde</h2>
          <Link href="/memory" className="text-sm text-nexus-cyan">Editar o agregar →</Link>
        </div>
        {memories.loading && <p className="text-sm text-nexus-muted">Cargando…</p>}
        {memories.data && memories.data.memories.length === 0 && (
          <p className="text-sm text-nexus-muted">Todavía nada. Decile por voz: «recordá que los martes atiendo en el hospital».</p>
        )}
        <ul className="flex flex-col gap-2">
          {memories.data?.memories.slice(0, 20).map((m) => (
            <li key={m.id} className="rounded-xl border border-nexus-border p-3 text-sm">
              {m.content}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-panel flex flex-col gap-3 p-4" aria-labelledby="dictation-title">
        <h2 id="dictation-title" className="text-lg font-semibold">Cómo te escucho</h2>
        <p className="text-sm text-nexus-muted">
          El micrófono sigue escuchando mientras respirás o pensás. Se detiene cuando tocás <strong>Listo</strong> o después de esta pausa sin hablar:
        </p>
        <div className="flex flex-wrap gap-2">
          {SILENCE_OPTIONS.map((o) => (
            <button
              key={o.ms}
              type="button"
              aria-pressed={silence === o.ms}
              onClick={() => {
                setSilenceMs(o.ms);
                setSilence(o.ms);
              }}
              className={`rounded-full border px-4 py-2 text-sm ${silence === o.ms ? "border-nexus-cyan bg-nexus-cyan text-nexus-bg" : "border-nexus-border"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
