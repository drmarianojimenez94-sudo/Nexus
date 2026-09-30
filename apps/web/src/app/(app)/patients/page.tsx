"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Patient } from "@nexus/shared";
import { api } from "@/lib/api";
import {
  ClinicalHeader,
  ClinicalNotice,
  ClinicalError,
  clinicalButton,
  clinicalInput,
  clinicalSecondary,
} from "@/components/ClinicalUi";
export default function PatientsPage() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [archived, setArchived] = useState(false),
    [data, setData] = useState<{ patients: Patient[]; total: number } | null>(
      null,
    ),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    const timer = setTimeout(() => {
      api
        .get<{ patients: Patient[]; total: number }>(
          `/clinical/patients?q=${encodeURIComponent(q)}&page=${page}&archived=${archived}`,
        )
        .then((r) => {
          if (!cancelled) {
            setData(r);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, page, archived]);
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title="Pacientes"
        detail="Tu consultorio, con una ficha para cada persona."
      />
      <ClinicalNotice />
      <section className="glass-panel flex flex-col gap-3 p-4 sm:flex-row">
        <input
          aria-label="Buscar paciente"
          placeholder="Buscar por nombre o documento (2 letras o más)…"
          className={clinicalInput}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Link className={`${clinicalButton} shrink-0`} href="/patients/new">
          Nuevo paciente
        </Link>
      </section>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            setPage(1);
          }}
        />
        Mostrar fichas archivadas
      </label>
      <ClinicalError message={error} />
      {!data && !error && <p role="status">Cargando fichas…</p>}
      {data && (
        <>
          <p className="text-sm text-nexus-muted">
            {data.total} fichas · página {page}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.patients.map((p) => (
              <Link
                key={p.id}
                href={`/patients/${p.id}`}
                className="glass-panel p-4"
              >
                <h2 className="font-semibold">{p.name}</h2>
                <p className="mt-1 text-sm text-nexus-muted">
                  {p.document
                    ? `Documento: ${p.document}`
                    : "Documento no registrado"}
                </p>
                <p className="mt-2 text-xs text-nexus-cyan">Abrir ficha →</p>
              </Link>
            ))}
          </div>
          {!data.patients.length && (
            <section className="glass-panel p-6">
              <p>No hay pacientes para esta búsqueda.</p>
              <p className="mt-2 text-sm text-nexus-muted">
                Creá una ficha y elegí una plantilla para registrar la primera
                atención.
              </p>
            </section>
          )}
          <div className="flex gap-3">
            <button
              className={clinicalSecondary}
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className={clinicalSecondary}
              disabled={page * 30 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
