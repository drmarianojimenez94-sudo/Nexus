"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { listClinicalDrafts } from "@/lib/clinicalDrafts";
import type { DraftSnapshot } from "./EncounterEditor";
export function ClinicalLocalDrafts({
  patientId,
  currentSlot,
}: {
  patientId: string;
  currentSlot?: string;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<{ slot: string; value: DraftSnapshot }[]>(
    [],
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRows([]);
    setError("");
    if (user)
      void listClinicalDrafts<DraftSnapshot>(user.id, patientId)
        .then((items) => {
          if (active)
            setRows(items.filter((item) => item.slot !== currentSlot));
        })
        .catch(() => {
          if (active)
            setError("No se pudieron leer los borradores de este dispositivo.");
        });
    return () => {
      active = false;
    };
  }, [user, patientId, currentSlot]);
  if (!rows.length && !error) return null;
  return (
    <section className="glass-panel flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Borradores de este dispositivo</h2>
      <p className="text-xs text-nexus-muted">
        Se guardan cifrados para tu cuenta. No aparecen en otros dispositivos
        hasta guardarlos en Nexus.
      </p>
      {error && <p role="status">{error}</p>}
      {rows.map(({ slot, value }) => {
        const suffix = slot.slice(patientId.length + 1);
        const href = value.encounterId
          ? `/patients/${patientId}/consultations/${value.encounterId}`
          : `/patients/${patientId}/consultations/new?draft=${suffix === "new" ? "legacy" : suffix}`;
        return (
          <Link
            className="rounded-lg border border-nexus-border p-3 text-sm text-nexus-cyan"
            href={href}
            key={slot}
          >
            {value.template?.name || "Consulta"} ·{" "}
            {value.input?.occurredAt
              ? new Date(value.input.occurredAt).toLocaleString("es-AR")
              : "Sin fecha"}
            {suffix === "new" && " · borrador anterior"}
          </Link>
        );
      })}
    </section>
  );
}
