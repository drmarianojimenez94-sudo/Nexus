"use client";
import type {
  ClinicalEncounter,
  EncounterInput,
  ClinicalTemplate,
} from "@nexus/shared";
import { clinicalInput, clinicalSecondary } from "./ClinicalUi";

export function reconcileClinicalDraft(
  local: EncounterInput,
  server: ClinicalEncounter,
): EncounterInput {
  // A stored encounter's template is immutable. Never import unknown field keys.
  const fields = { ...server.fields };
  for (const field of server.template.fields) {
    if (Object.hasOwn(local.fields, field.key))
      fields[field.key] = local.fields[field.key]!;
  }
  return {
    templateId: server.templateId,
    occurredAt: local.occurredAt,
    fields,
    dictation: local.dictation,
  };
}
export function ClinicalDraftConflict({
  local,
  server,
  localTemplate,
  onUseLocal,
  onUseServer,
  writable,
}: {
  writable: boolean;
  localTemplate: ClinicalTemplate;
  local: EncounterInput;
  server: ClinicalEncounter;
  onUseLocal: () => void;
  onUseServer: () => void;
}) {
  return (
    <section
      aria-label="Comparar versiones de la consulta"
      className="glass-panel flex flex-col gap-3 border border-nexus-amber p-4"
    >
      <h2 className="font-semibold">Hay dos versiones de esta consulta</h2>
      <p className="text-sm">
        Nexus tiene la versión {server.version}. El borrador de este dispositivo
        se conserva hasta que elijas cómo continuar. Revisá ambos textos antes
        de guardar.
      </p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {[
          { label: "Borrador local", input: local, template: localTemplate },
          {
            label: "Guardado en Nexus",
            input: server,
            template: server.template,
          },
        ].map((column) => (
          <div className="min-w-0" key={column.label}>
            <h3 className="mb-2 font-medium">{column.label}</h3>
            <p className="mb-3 text-xs">
              {column.template.name} ·{" "}
              {new Date(column.input.occurredAt).toLocaleString("es-AR")}
            </p>
            {[
              ...column.template.fields,
              { key: "dictation", label: "Transcripción pendiente" },
            ].map((field) => (
              <label key={field.key} className="mb-3 block text-sm">
                {field.label}
                <textarea
                  aria-label={`${column.label}: ${field.label}`}
                  className={`${clinicalInput} mt-1`}
                  rows={3}
                  readOnly
                  value={
                    field.key === "dictation"
                      ? column.input.dictation
                      : column.input.fields[field.key] || ""
                  }
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-nexus-muted">
        Podés seleccionar y copiar el texto de ambas columnas. Incorporar el
        borrador local solo copia campos presentes en la plantilla guardada;
        todavía tendrás que guardar y revisar la consulta.
      </p>
      <div className="flex flex-wrap gap-3">
        {server.status !== "FINAL" && (
          <button
            className={clinicalSecondary}
            disabled={!writable}
            onClick={onUseLocal}
          >
            Incorporar mi borrador a la versión actual
          </button>
        )}
        <button
          className={clinicalSecondary}
          disabled={!writable}
          onClick={() => {
            if (
              window.confirm(
                "¿Descartar el borrador local y continuar con el contenido de Nexus? Copiá primero cualquier texto que necesites conservar.",
              )
            )
              onUseServer();
          }}
        >
          Usar versión de Nexus
        </button>
      </div>
    </section>
  );
}
