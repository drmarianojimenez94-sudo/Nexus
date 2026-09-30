"use client";
import { use, useState } from "react";
import Link from "next/link";
import type { Patient, ClinicalEncounter } from "@nexus/shared";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import { PatientForm } from "@/components/PatientForm";
import { ClinicalFollowups } from "@/components/ClinicalFollowups";
import {
  ClinicalHeader,
  ClinicalError,
  clinicalButton,
  clinicalSecondary,
  downloadText,
} from "@/components/ClinicalUi";
export default function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    { data, loading, error, reload } = useApiData<{
      patient: Patient;
      encounters: ClinicalEncounter[];
    }>(`/clinical/patients/${id}`),
    [editing, setEditing] = useState(false),
    [actionError, setActionError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const patient = data?.patient.id === id ? data.patient : undefined;
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title={patient?.name || "Ficha del paciente"}
        detail={
          patient
            ? `${patient.document ? `Documento ${patient.document}` : "Documento no registrado"}${patient.archived ? " · Archivada" : ""}`
            : undefined
        }
      />
      <ClinicalError message={actionError || error} />
      {loading && <p>Cargando ficha…</p>}
      {patient && (
        <>
          <div className="sticky top-0 z-20 rounded-xl border border-nexus-border bg-nexus-bg/95 p-3 text-sm">
            <strong>{patient.name}</strong> ·{" "}
            {patient.document || "Sin documento"}
          </div>
          <div className="flex flex-wrap gap-3">
            {!patient.archived && (
              <Link
                className={clinicalButton}
                href={`/patients/${id}/consultations/new`}
              >
                Nueva consulta
              </Link>
            )}
            <button
              className={clinicalSecondary}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Cerrar edición" : "Editar ficha"}
            </button>
            <button
              disabled={busy}
              className={clinicalSecondary}
              onClick={async () => {
                setBusy(true);
                try {
                  const output = await api.get(
                    `/clinical/patients/${id}/export`,
                  );
                  downloadText(
                    `nexus-paciente-${id}.json`,
                    JSON.stringify(output, null, 2),
                    "application/json",
                  );
                } catch (e) {
                  setActionError(
                    e instanceof Error ? e.message : "No se pudo exportar",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Exportar ficha
            </button>
            <button
              disabled={busy}
              className={clinicalSecondary}
              onClick={async () => {
                if (
                  !window.confirm(
                    patient.archived
                      ? "¿Reactivar esta ficha?"
                      : "¿Archivar esta ficha? Se conserva su historial.",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await api.put(`/clinical/patients/${id}`, {
                    ...patient,
                    archived: !patient.archived,
                  });
                  await reload();
                } catch (e) {
                  setActionError(
                    e instanceof Error ? e.message : "No se pudo actualizar",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {patient.archived ? "Reactivar" : "Archivar"}
            </button>
          </div>
          {editing ? (
            <PatientForm
              key={`${patient.id}:${patient.version}`}
              initial={patient}
              onSave={async (input) => {
                await api.put(`/clinical/patients/${id}`, {
                  ...input,
                  version: patient.version,
                  archived: patient.archived,
                });
                setEditing(false);
                await reload();
              }}
            />
          ) : (
            <section className="glass-panel grid gap-4 p-4 sm:grid-cols-2">
              {[
                ["Nacimiento", patient.birthDate],
                ["Teléfono", patient.phone],
                ["Alergias", patient.allergies],
                ["Medicación habitual", patient.medication],
                ["Antecedentes", patient.history],
              ].map(([label, value]) => (
                <div key={label}>
                  <h2 className="text-xs uppercase tracking-wider text-nexus-muted">
                    {label}
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {value || "No registrado"}
                  </p>
                </div>
              ))}
            </section>
          )}
          <section className="glass-panel p-4">
            <h2 className="mb-3 font-semibold">Historial de consultas</h2>
            <p className="mb-3 text-xs text-nexus-muted">
              Últimas 100 atenciones. La exportación incluye el historial
              completo. Validar una consulta no equivale a una firma digital.
            </p>
            {!data?.encounters.length && (
              <p className="text-sm text-nexus-muted">
                Todavía no hay consultas. Elegí una plantilla para comenzar.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {data?.encounters.map((c) => (
                <Link
                  key={c.id}
                  className="rounded-xl border border-nexus-border p-3"
                  href={`/patients/${id}/consultations/${c.id}`}
                >
                  <p className="font-medium">{c.template.name}</p>
                  <p className="mt-1 text-xs text-nexus-muted">
                    {new Date(c.occurredAt).toLocaleString("es-AR")} ·{" "}
                    {c.status === "FINAL" ? "Validada" : "Borrador"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
          <ClinicalFollowups patientId={id} />
        </>
      )}
    </div>
  );
}
