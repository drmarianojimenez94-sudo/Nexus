"use client";
import { useState } from "react";
import type { ClinicalTemplate } from "@nexus/shared";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import {
  ClinicalHeader,
  ClinicalError,
  clinicalInput,
  clinicalButton,
} from "@/components/ClinicalUi";
export default function TemplatesPage() {
  const { data, error, reload } = useApiData<{ templates: ClinicalTemplate[] }>(
      "/clinical/templates",
    ),
    [name, setName] = useState(""),
    [labels, setLabels] = useState(
      "Motivo de consulta\nEvaluación\nPlan\nSeguimiento",
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title="Plantillas clínicas"
        detail="Seis plantillas iniciales y tus propias versiones. Ningún hallazgo se completa automáticamente."
      />
      <ClinicalError message={message || error} />
      <div className="grid gap-3 sm:grid-cols-2">
        {data?.templates.map((t) => (
          <section className="glass-panel p-4" key={t.id}>
            <h2 className="font-semibold">{t.name}</h2>
            <p className="mt-1 text-sm text-nexus-muted">{t.description}</p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {t.fields.map((f) => (
                <li key={f.key}>· {f.label}</li>
              ))}
            </ul>
            <button
              className="mt-3 text-sm text-nexus-cyan"
              onClick={() => {
                setName(`${t.name} — mi versión`);
                setLabels(t.fields.map((f) => f.label).join("\n"));
                document.getElementById("template-name")?.focus();
              }}
            >
              Usar como base
            </button>
          </section>
        ))}
      </div>
      <form
        className="glass-panel flex flex-col gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage(null);
          try {
            const fields = labels
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .map((label, i) => ({ key: `field_${i}`, label }));
            await api.post("/clinical/templates", {
              name,
              description: "Plantilla personal",
              fields,
            });
            setName("");
            await reload();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "No se pudo guardar");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="font-semibold">Crear mi plantilla</h2>
        <label className="text-sm">
          Nombre
          <input
            id="template-name"
            required
            minLength={2}
            maxLength={120}
            className={`${clinicalInput} mt-2`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Un campo por línea (máximo 30)
          <textarea
            required
            rows={6}
            maxLength={4000}
            className={`${clinicalInput} mt-2`}
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
          />
        </label>
        <button disabled={busy} className={clinicalButton}>
          {busy ? "Guardando…" : "Guardar plantilla"}
        </button>
      </form>
    </div>
  );
}
