"use client";
import { useState } from "react";
import { patientInputSchema, type PatientInput } from "@nexus/shared";
import { ClinicalError, clinicalButton, clinicalInput } from "./ClinicalUi";
export const emptyPatient: PatientInput = {
  name: "",
  document: "",
  birthDate: "",
  phone: "",
  familyContact: "",
  allergies: "",
  medication: "",
  history: "",
};
export function PatientForm({
  initial = emptyPatient,
  onSave,
}: {
  initial?: PatientInput;
  onSave: (input: PatientInput) => Promise<void>;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const change = (key: keyof PatientInput, value: string) =>
    setData((prev) => ({ ...prev, [key]: value }));
  return (
    <form
      className="glass-panel flex flex-col gap-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const parsed = patientInputSchema.safeParse(data);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message || "Revisá la ficha");
          return;
        }
        setBusy(true);
        try {
          await onSave(parsed.data);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo guardar");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["name", "Nombre y apellido", "text"],
              ["document", "Documento", "text"],
              ["birthDate", "Fecha de nacimiento", "date"],
              ["phone", "Teléfono", "tel"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="flex min-w-0 flex-col gap-2 text-sm">
              {label}
              <input
                required={key === "name"}
                type={type}
                maxLength={key === "name" ? 160 : 80}
                autoComplete="off"
                className={clinicalInput}
                value={data[key]}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        {(
          [
            [
              "familyContact",
              "Núcleo familiar / contacto (Ley 26.529, art. 15 b)",
            ],
            ["allergies", "Alergias (dejar vacío si no se investigaron)"],
            ["medication", "Medicación habitual"],
            ["history", "Antecedentes"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-2 text-sm">
            {label}
            <textarea
              rows={key === "familyContact" ? 2 : 3}
              maxLength={key === "familyContact" ? 300 : 10000}
              className={clinicalInput}
              value={data[key] ?? ""}
              onChange={(e) => change(key, e.target.value)}
            />
          </label>
        ))}
      </fieldset>
      <ClinicalError message={error} />
      <button className={clinicalButton} disabled={busy}>
        {busy ? "Guardando…" : "Guardar ficha"}
      </button>
    </form>
  );
}
