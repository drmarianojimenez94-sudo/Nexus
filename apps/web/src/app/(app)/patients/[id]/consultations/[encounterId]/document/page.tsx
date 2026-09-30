"use client";
import { use } from "react";
import Link from "next/link";
import type { Patient, ClinicalEncounter } from "@nexus/shared";
import { useApiData } from "@/lib/useApiData";
import { useAuth } from "@/lib/auth-context";
import {
  ClinicalError,
  clinicalButton,
  clinicalSecondary,
  downloadText,
} from "@/components/ClinicalUi";
export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string; encounterId: string }>;
}) {
  const { id, encounterId } = use(params),
    { user } = useAuth(),
    { data, loading, error } = useApiData<{
      patient: Patient;
      encounter: ClinicalEncounter;
    }>(`/clinical/encounters/${encounterId}`);
  if (data && data.patient.id !== id)
    return (
      <ClinicalError message="La consulta no corresponde a este paciente" />
    );
  const text = data
    ? `${data.encounter.template.name}\nPaciente: ${data.patient.name}\nDocumento: ${data.patient.document || "No registrado"}\nFecha: ${new Date(data.encounter.occurredAt).toLocaleString("es-AR")}\nProfesional: ${user?.name || ""}\nEstado: ${data.encounter.status === "FINAL" ? "Validada por el usuario (sin firma digital)" : "BORRADOR"}\n\n${data.encounter.template.fields.map((f) => `${f.label}\n${data.encounter.fields[f.key] || "No registrado"}`).join("\n\n")}`
    : "";
  return (
    <div className="flex flex-col gap-4">
      <div className="clinical-print-controls flex flex-wrap gap-3">
        <Link
          className={clinicalSecondary}
          href={`/patients/${id}/consultations/${encounterId}`}
        >
          Volver a consulta
        </Link>
        <button
          disabled={!data}
          className={clinicalButton}
          onClick={() => window.print()}
        >
          Imprimir / guardar PDF
        </button>
        <button
          disabled={!data}
          className={clinicalSecondary}
          onClick={() =>
            downloadText(`nexus-consulta-${encounterId}.txt`, text)
          }
        >
          Descargar texto
        </button>
      </div>
      <ClinicalError message={error} />
      {loading && <p>Cargando documento…</p>}
      {data && (
        <article className="clinical-document rounded-xl bg-white p-6 text-slate-900 sm:p-10">
          <header className="border-b border-slate-300 pb-5">
            <p className="text-xs uppercase tracking-widest">
              Registro de atención · Nexus
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {data.encounter.template.name}
            </h1>
            <p className="mt-4">
              <strong>Paciente:</strong> {data.patient.name}
            </p>
            <p>
              <strong>Documento:</strong>{" "}
              {data.patient.document || "No registrado"}
            </p>
            <p>
              <strong>Fecha:</strong>{" "}
              {new Date(data.encounter.occurredAt).toLocaleString("es-AR")}
            </p>
            <p>
              <strong>Profesional:</strong> {user?.name}
            </p>
            <p className="mt-3 text-sm">
              {data.encounter.status === "FINAL"
                ? `Validada por el usuario el ${data.encounter.finalizedAt ? new Date(data.encounter.finalizedAt).toLocaleString("es-AR") : ""}. Sin firma digital.`
                : "BORRADOR — pendiente de revisión y validación."}
            </p>
          </header>
          {data.encounter.template.fields.map((f) => (
            <section key={f.key} className="mt-6">
              <h2 className="font-semibold">{f.label}</h2>
              <p className="mt-2 whitespace-pre-wrap break-words">
                {data.encounter.fields[f.key] || "No registrado"}
              </p>
            </section>
          ))}
          <footer className="mt-8 border-t border-slate-300 pt-3 text-xs">
            Documento generado a partir del registro guardado. No se aplican
            diagnósticos ni tratamientos automáticos.
          </footer>
        </article>
      )}
    </div>
  );
}
