"use client";
import { useState } from "react";
import Link from "next/link";
import type { ClinicalEncounter, ClinicalTemplate } from "@nexus/shared";
import { useApiData } from "@/lib/useApiData";
import { ClinicalError, clinicalInput, clinicalSecondary } from "./ClinicalUi";
export function ClinicalHistory({ patientId }: { patientId: string }) {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("ALL"),
    [templateId, setTemplateId] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState("");
  const query = new URLSearchParams({ page: String(page), status });
  if (templateId) query.set("templateId", templateId);
  if (search) query.set("q", search);
  if (from) query.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) query.set("to", new Date(`${to}T23:59:59.999`).toISOString());
  const { data, loading, error } = useApiData<{
    encounters: ClinicalEncounter[];
    total: number;
    pageSize: number;
  }>(`/clinical/patients/${patientId}/history?${query}`);
  const templates = useApiData<{ templates: ClinicalTemplate[] }>(
    "/clinical/templates",
  );
  return (
    <section className="glass-panel flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Historial de consultas</h2>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q);
          setPage(1);
        }}
      >
        <label className="text-sm">
          Estado
          <select
            className={`${clinicalInput} mt-2`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Todas</option>
            <option value="DRAFT">Borradores</option>
            <option value="FINAL">Validadas</option>
          </select>
        </label>
        <label className="text-sm">
          Plantilla
          <select
            className={`${clinicalInput} mt-2`}
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas las plantillas</option>
            {templates.data?.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Desde
          <input
            className={`${clinicalInput} mt-2`}
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            className={`${clinicalInput} mt-2`}
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm">
          Buscar en campos clínicos
          <input
            className={`${clinicalInput} mt-2`}
            maxLength={160}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button className={clinicalSecondary}>Buscar historial</button>
      </form>
      <ClinicalError message={error || templates.error} />
      {loading && <p role="status">Cargando historial…</p>}
      {data && (
        <p className="text-xs text-nexus-muted">
          {data.total} consultas · página {page}. Validar no equivale a firma
          digital.
        </p>
      )}
      {data?.encounters.map((c) => (
        <Link
          key={c.id}
          className="rounded-xl border border-nexus-border p-3"
          href={`/patients/${patientId}/consultations/${c.id}`}
        >
          <p className="font-medium">{c.template.name}</p>
          <p className="mt-1 text-xs text-nexus-muted">
            {new Date(c.occurredAt).toLocaleString("es-AR")} ·{" "}
            {c.status === "FINAL" ? "Validada" : "Borrador"}
          </p>
        </Link>
      ))}
      {data && !data.encounters.length && (
        <p className="text-sm text-nexus-muted">
          No hay consultas con estos filtros.
        </p>
      )}
      <nav aria-label="Páginas del historial" className="flex gap-3">
        <button
          className={clinicalSecondary}
          disabled={loading || page === 1}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </button>
        <button
          className={clinicalSecondary}
          disabled={loading || !data || page * data.pageSize >= data.total}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </button>
      </nav>
    </section>
  );
}
