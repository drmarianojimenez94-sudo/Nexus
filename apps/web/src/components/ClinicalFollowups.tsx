"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClinicalFollowup } from "@nexus/shared";
import { api } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import {
  ClinicalError,
  clinicalInput,
  clinicalButton,
  clinicalSecondary,
} from "./ClinicalUi";
export function ClinicalFollowups({ patientId }: { patientId?: string }) {
  const [status, setStatus] = useState("PENDING"),
    [page, setPage] = useState(1),
    [title, setTitle] = useState(""),
    [dueAt, setDueAt] = useState(""),
    [kind, setKind] = useState("CONTROL"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useApiData<{
    followups: ClinicalFollowup[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/clinical/followups?status=${status}&page=${page}${patientId ? `&patientId=${patientId}` : ""}`,
  );
  useEffect(() => {
    if (!data) return;
    const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [data, page]);
  return (
    <section className="glass-panel flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Seguimientos y resultados</h2>
        <select
          aria-label="Estado de seguimientos"
          className="rounded-lg border border-nexus-border bg-nexus-bg p-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="PENDING">Pendientes</option>
          <option value="DONE">Resueltos</option>
        </select>
      </div>
      {patientId && (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api.post("/clinical/followups", {
                patientId,
                title,
                dueAt: new Date(dueAt).toISOString(),
                kind,
              });
              setTitle("");
              setDueAt("");
              await reload();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "No se pudo guardar",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm">
            Pendiente
            <input
              required
              maxLength={300}
              className={`${clinicalInput} mt-2`}
              placeholder="Revisar resultado de laboratorio…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Fecha de seguimiento
              <input
                required
                type="datetime-local"
                className={`${clinicalInput} mt-2`}
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Tipo
              <select
                className={`${clinicalInput} mt-2`}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="CONTROL">Control</option>
                <option value="RESULT">Resultado de estudio</option>
                <option value="CALL">Llamada</option>
              </select>
            </label>
          </div>
          <button disabled={busy} className={clinicalButton}>
            {busy ? "Guardando…" : "Agregar seguimiento"}
          </button>
        </form>
      )}
      <ClinicalError message={error || loadError} />
      {loading && <p>Cargando…</p>}
      {data && (
        <p className="text-sm text-nexus-muted" role="status">
          {data.total} seguimientos · página {data.page}
        </p>
      )}
      {data?.followups.map((f) => (
        <div
          key={f.id}
          className="flex flex-col gap-3 rounded-xl border border-nexus-border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <Link
              href={`/patients/${f.patientId}`}
              className="font-medium text-nexus-cyan"
            >
              {f.patientName}
            </Link>
            <p className="mt-1 text-sm">{f.title}</p>
            <p
              className={`mt-1 text-xs ${f.status === "PENDING" && Date.parse(f.dueAt) < Date.now() ? "text-nexus-amber" : "text-nexus-muted"}`}
            >
              {new Date(f.dueAt).toLocaleString("es-AR")}
              {f.status === "PENDING" && Date.parse(f.dueAt) < Date.now()
                ? " · Vencido"
                : ""}
            </p>
          </div>
          <button
            disabled={busy}
            className={clinicalSecondary}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.patch(`/clinical/followups/${f.id}`, {
                  status: f.status === "DONE" ? "PENDING" : "DONE",
                });
                await reload();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo actualizar",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {f.status === "DONE" ? "Reabrir" : "Marcar resuelto"}
          </button>
        </div>
      ))}
      {data && !data.followups.length && (
        <p className="text-sm text-nexus-muted">
          No hay seguimientos en este estado.
        </p>
      )}
      {data && (
        <nav aria-label="Páginas de seguimientos" className="flex gap-3">
          <button
            type="button"
            className={clinicalSecondary}
            disabled={busy || loading || page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </button>
          <button
            type="button"
            className={clinicalSecondary}
            disabled={
              busy || loading || data.page * data.pageSize >= data.total
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
      <p className="text-xs text-nexus-muted">
        Estos pendientes se consultan aquí. No se envía información clínica por
        correo ni al calendario personal.
      </p>
    </section>
  );
}
