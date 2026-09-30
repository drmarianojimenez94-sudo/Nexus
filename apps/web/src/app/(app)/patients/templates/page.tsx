"use client";
import { useRef, useState } from "react";
import type { ClinicalField, ClinicalTemplate } from "@nexus/shared";
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
    "/clinical/templates?archived=all",
  );
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [fields, setFields] = useState<ClinicalField[]>([
      { key: "reason", label: "Motivo de consulta" },
      { key: "assessment", label: "Evaluación" },
      { key: "plan", label: "Plan" },
      { key: "followup", label: "Seguimiento" },
    ]),
    [editing, setEditing] = useState<ClinicalTemplate | null>(null),
    [search, setSearch] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [favoritesOnly, setFavoritesOnly] = useState(false),
    [versions, setVersions] = useState<ClinicalTemplate[] | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const clientId = useRef<string | null>(null);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  function populate(t: ClinicalTemplate, edit = false) {
    setEditing(edit ? t : null);
    setName(edit ? t.name : `${t.name} — mi versión`);
    setDescription(t.description);
    setFields(t.fields.map((f) => ({ ...f })));
    clientId.current = null;
    document.getElementById("template-name")?.focus();
  }
  const filtered = data?.templates.filter(
    (t) =>
      Boolean(t.archived) === showArchived &&
      (!favoritesOnly || t.favorite) &&
      `${t.name} ${t.description}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  return (
    <div className="flex flex-col gap-4">
      <ClinicalHeader
        title="Plantillas clínicas"
        detail="Plantillas personales, favoritos y versiones. Cada consulta conserva la plantilla con la que se creó."
      />
      <ClinicalError message={message || error} />
      <section className="glass-panel flex flex-wrap gap-3 p-4">
        <label className="flex-1 text-sm">
          Buscar plantilla
          <input
            className={`${clinicalInput} mt-1`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre o descripción"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Archivadas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
          />
          Sólo favoritas
        </label>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered?.map((t) => (
          <section className="glass-panel p-4" key={t.id}>
            <h2 className="font-semibold">
              {t.name}{" "}
              <span className="text-sm text-nexus-muted">v{t.version}</span>
            </h2>
            <p className="mt-1 text-sm text-nexus-muted">{t.description}</p>
            <p className="mt-1 text-xs text-nexus-muted">
              {t.builtin
                ? "Plantilla inicial: creá una copia para modificarla"
                : "Plantilla personal"}
              {t.archived ? " · Archivada" : ""}
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {t.fields.map((f) => (
                <li key={f.key}>· {f.label}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-nexus-cyan">
              <button disabled={busy} onClick={() => populate(t)}>
                Usar como base
              </button>
              {!t.builtin && !t.archived && (
                <button disabled={busy} onClick={() => populate(t, true)}>
                  Editar: nueva versión
                </button>
              )}
              <button
                disabled={busy}
                aria-pressed={Boolean(t.favorite)}
                onClick={() =>
                  action(async () => {
                    await api.patch(`/clinical/templates/${t.id}`, {
                      revision: t.revision ?? 1,
                      favorite: !t.favorite,
                    });
                  })
                }
              >
                {t.favorite ? "Quitar favorita" : "Marcar favorita"}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api.patch(`/clinical/templates/${t.id}`, {
                      revision: t.revision ?? 1,
                      archived: !t.archived,
                    });
                  })
                }
              >
                {t.archived ? "Restaurar" : "Archivar"}
              </button>
              {!t.builtin && (
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const result = await api.get<{
                        templates: ClinicalTemplate[];
                      }>(`/clinical/templates/${t.id}/versions`);
                      setVersions(result.templates);
                    })
                  }
                >
                  Ver versiones
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
      {filtered?.length === 0 && (
        <p className="text-sm text-nexus-muted">
          No hay plantillas con esos filtros.
        </p>
      )}
      {versions && (
        <section className="glass-panel p-4">
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">Historial de versiones</h2>
            <button onClick={() => setVersions(null)}>Cerrar</button>
          </div>
          <p className="mt-2 text-sm text-nexus-muted">
            Las consultas existentes mantienen sus campos originales.
          </p>
          {versions.map((t) => (
            <div key={t.id} className="mt-3 border-t border-white/10 pt-3">
              <p>
                {t.name} · versión {t.version} ·{" "}
                {t.archived ? "archivada" : "activa"}
              </p>
              <p className="text-sm text-nexus-muted">
                {t.fields.map((f) => f.label).join(" · ")}
              </p>
              <button
                className="mt-2 text-sm text-nexus-cyan"
                onClick={() => populate(t)}
              >
                Crear una copia de esta versión
              </button>
            </div>
          ))}
        </section>
      )}
      <form
        className="glass-panel flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            clientId.current ??= crypto.randomUUID();
            const payload = {
              name,
              description,
              fields,
              clientId: clientId.current,
            };
            if (editing)
              await api.post(`/clinical/templates/${editing.id}/versions`, {
                ...payload,
                revision: editing.revision ?? 1,
              });
            else await api.post("/clinical/templates", payload);
            setName("");
            setDescription("");
            setEditing(null);
            clientId.current = null;
            setVersions(null);
          });
        }}
      >
        <h2 className="font-semibold">
          {editing ? `Nueva versión de ${editing.name}` : "Crear mi plantilla"}
        </h2>
        {editing && (
          <p className="text-sm text-nexus-muted">
            Guardar archiva la versión anterior. Las consultas ya creadas
            conservan su contenido.
          </p>
        )}
        <label className="text-sm">
          Nombre
          <input
            id="template-name"
            required
            minLength={2}
            maxLength={120}
            disabled={busy}
            className={`${clinicalInput} mt-2`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Descripción
          <textarea
            maxLength={300}
            disabled={busy}
            className={`${clinicalInput} mt-2`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p className="text-sm">Campos de la consulta (máximo 30)</p>
        {fields.map((field, i) => (
          <div className="flex items-center gap-2" key={field.key}>
            <input
              aria-label={`Nombre del campo ${i + 1}`}
              required
              maxLength={120}
              disabled={busy}
              className={`${clinicalInput} min-w-0 flex-1`}
              value={field.label}
              onChange={(e) =>
                setFields(
                  fields.map((f, n) =>
                    n === i ? { ...f, label: e.target.value } : f,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={`Subir campo ${i + 1}`}
              disabled={busy || i === 0}
              onClick={() => {
                const updated = [...fields];
                [updated[i - 1], updated[i]] = [updated[i]!, updated[i - 1]!];
                setFields(updated);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Eliminar campo ${i + 1}`}
              disabled={busy || fields.length === 1}
              onClick={() => setFields(fields.filter((_, n) => n !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-left text-sm text-nexus-cyan"
          disabled={busy || fields.length >= 30}
          onClick={() =>
            setFields([
              ...fields,
              {
                key: `f_${crypto.randomUUID().replaceAll("-", "")}`,
                label: "",
              },
            ])
          }
        >
          + Agregar campo
        </button>
        <div className="flex gap-3">
          <button disabled={busy} className={clinicalButton}>
            {busy
              ? "Guardando…"
              : editing
                ? "Guardar nueva versión"
                : "Guardar plantilla"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(null);
              clientId.current = null;
              setName("");
              setDescription("");
            }}
          >
            {editing ? "Cancelar edición" : "Nueva plantilla"}
          </button>
        </div>
      </form>
    </div>
  );
}
