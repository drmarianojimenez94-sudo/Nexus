"use client";
import { use, useState } from "react";
import Link from "next/link";
import type {
  Patient,
  ClinicalEncounter,
  ClinicalFollowup,
} from "@nexus/shared";
import { useApiData } from "@/lib/useApiData";
import {
  ClinicalError,
  clinicalButton,
  clinicalSecondary,
} from "@/components/ClinicalUi";
export default function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    [drafts, setDrafts] = useState(false);
  const { data, loading, error } = useApiData<{
    exportedAt: string;
    patient: Patient;
    encounters: ClinicalEncounter[];
    followups: ClinicalFollowup[];
  }>(`/clinical/patients/${id}/export`);
  const patient = data?.patient.id === id ? data.patient : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="clinical-print-controls flex flex-wrap gap-3">
        <Link className={clinicalSecondary} href={`/patients/${id}`}>
          Volver a ficha
        </Link>
        <button
          disabled={!patient}
          className={clinicalButton}
          onClick={() => window.print()}
        >
          Imprimir / guardar PDF
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={drafts}
            onChange={(e) => setDrafts(e.target.checked)}
          />
          Incluir borradores claramente identificados
        </label>
      </div>
      <ClinicalError message={error} />
      {loading && <p>Cargando resumen…</p>}
      {patient && data && (
        <article className="clinical-document rounded-xl bg-white p-6 text-slate-900 sm:p-10">
          <header className="border-b border-slate-300 pb-4">
            <h1 className="text-2xl font-semibold">
              Resumen longitudinal · {patient.name}
            </h1>
            <p>
              Documento: {patient.document || "No registrado"} · Nacimiento:{" "}
              {patient.birthDate || "No registrado"}
            </p>
            <p className="mt-2 text-xs">
              Ficha actual y registros guardados. Generado{" "}
              {new Date(data.exportedAt).toLocaleString("es-AR")}. Sin firma
              digital.{" "}
              {drafts
                ? "Incluye borradores."
                : "Incluye únicamente consultas validadas."}
            </p>
          </header>
          {[
            ["Alergias", patient.allergies],
            ["Medicación habitual", patient.medication],
            ["Antecedentes", patient.history],
          ].map(([label, value]) => (
            <section key={label} className="mt-4">
              <h2 className="font-semibold">{label}</h2>
              <p className="whitespace-pre-wrap break-words">
                {value || "No registrado"}
              </p>
            </section>
          ))}
          <h2 className="mt-8 text-xl font-semibold">Evolución cronológica</h2>
          {!data.encounters.filter((c) => drafts || c.status === "FINAL")
            .length && <p>No hay consultas en la selección.</p>}
          {data.encounters
            .filter((c) => drafts || c.status === "FINAL")
            .map((c) => (
              <section
                key={c.id}
                className="mt-6 border-t border-slate-300 pt-4"
              >
                <h3 className="font-semibold">
                  {new Date(c.occurredAt).toLocaleString("es-AR")} ·{" "}
                  {c.template.name}
                </h3>
                <p className="text-xs">
                  {c.status === "FINAL"
                    ? "Validada por el usuario, sin firma digital"
                    : "BORRADOR — pendiente de validación"}{" "}
                  · versión {c.version}
                </p>
                {c.patientSnapshot && (
                  <p className="text-xs">
                    Identificación al validar: {c.patientSnapshot.name} ·{" "}
                    {c.patientSnapshot.document || "Sin documento"}
                  </p>
                )}
                {c.template.fields.map((f) => (
                  <div key={f.key} className="mt-3">
                    <h4 className="text-sm font-semibold">{f.label}</h4>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {c.fields[f.key] || "No registrado"}
                    </p>
                  </div>
                ))}
              </section>
            ))}
          <h2 className="mt-8 text-xl font-semibold">
            Seguimientos pendientes
          </h2>
          {data.followups
            .filter((f) => f.status === "PENDING")
            .map((f) => (
              <p key={f.id} className="mt-2 break-words">
                {new Date(f.dueAt).toLocaleString("es-AR")} · {f.title}
              </p>
            ))}
          {!data.followups.some((f) => f.status === "PENDING") && (
            <p>No registrados.</p>
          )}
        </article>
      )}
    </div>
  );
}
