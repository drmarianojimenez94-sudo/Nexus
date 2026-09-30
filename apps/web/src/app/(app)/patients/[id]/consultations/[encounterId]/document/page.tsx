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
  const identity = data?.encounter.patientSnapshot || data?.patient;
  const clinician = data?.encounter.clinicianSnapshot?.name || user?.name || "";
  const historicalIdentityMissing =
    data?.encounter.status === "FINAL" &&
    (!data.encounter.patientSnapshot || !data.encounter.clinicianSnapshot);
  const text =
    data && identity
      ? `${data.encounter.template.name}\nPaciente: ${identity.name}\nDocumento: ${identity.document || "No registrado"}\nFecha: ${new Date(data.encounter.occurredAt).toLocaleString("es-AR")}\nProfesional: ${clinician}\nEstado: ${data.encounter.status === "FINAL" ? "Validada por el usuario (sin firma digital)" : "BORRADOR"}\n\n${data.encounter.template.fields.map((f) => `${f.label}\n${data.encounter.fields[f.key] || "No registrado"}`).join("\n\n")}${data.encounter.dictation.trim() ? `\n\nTranscripción pendiente de incorporar\n${data.encounter.dictation}` : ""}${historicalIdentityMissing ? "\n\nDatos de identificación actuales; esta consulta no conserva una copia histórica." : ""}`
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
              <strong>Paciente:</strong> {identity?.name}
            </p>
            <p>
              <strong>Documento:</strong>{" "}
              {identity?.document || "No registrado"}
            </p>
            <p>
              <strong>Fecha:</strong>{" "}
              {new Date(data.encounter.occurredAt).toLocaleString("es-AR")}
            </p>
            <p>
              <strong>Profesional:</strong> {clinician}
            </p>
            <p className="mt-3 text-sm">
              {data.encounter.status === "FINAL"
                ? `Validada por el usuario el ${data.encounter.finalizedAt ? new Date(data.encounter.finalizedAt).toLocaleString("es-AR") : ""}. Sin firma digital.`
                : "BORRADOR — pendiente de revisión y validación."}
            </p>
          </header>
          {historicalIdentityMissing && (
            <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              Datos de identificación actuales; esta consulta no conserva una
              copia histórica.
            </p>
          )}
          {data.encounter.template.fields.map((f) => (
            <section key={f.key} className="mt-6">
              <h2 className="font-semibold">{f.label}</h2>
              <p className="mt-2 whitespace-pre-wrap break-words">
                {data.encounter.fields[f.key] || "No registrado"}
              </p>
            </section>
          ))}
          {data.encounter.dictation.trim() && (
            <section className="mt-6 rounded-lg border border-amber-300 p-3">
              <h2 className="font-semibold">
                Transcripción pendiente de incorporar
              </h2>
              <p className="mt-2 whitespace-pre-wrap break-words">
                {data.encounter.dictation}
              </p>
            </section>
          )}
          <footer className="mt-8 border-t border-slate-300 pt-3 text-xs">
            Documento generado a partir del registro guardado. No se aplican
            diagnósticos ni tratamientos automáticos.
          </footer>
        </article>
      )}
    </div>
  );
}
