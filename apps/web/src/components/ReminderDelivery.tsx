"use client";
import { useState } from "react";
import { useApiData } from "@/lib/useApiData";
import { api } from "@/lib/api";
import { ClinicalError, clinicalSecondary } from "./ClinicalUi";
interface DeliveryReminder {
  id: string;
  title: string;
  remindAt: string;
  fired: boolean;
  deliveryStatus: string;
  deliveryAttempts: number;
}
export function ReminderDelivery() {
  const { data, error, reload } = useApiData<{ reminders: DeliveryReminder[] }>(
      "/reminders",
    ),
    [message, setMessage] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <section className="glass-panel p-4">
      <h2 className="font-semibold">Entrega de recordatorios</h2>
      <p className="mt-2 text-xs text-nexus-muted">
        Programado no significa enviado. La entrega por correo requiere
        configurar el servicio y el proceso de envío.
      </p>
      <ClinicalError message={message || error} />
      <div className="mt-3 flex flex-col gap-3">
        {data?.reminders.map((r) => (
          <div key={r.id} className="rounded-xl border border-nexus-border p-3">
            <p className="text-sm">{r.title}</p>
            <p className="mt-1 text-xs text-nexus-muted">
              {new Date(r.remindAt).toLocaleString("es-AR")} ·{" "}
              {r.fired
                ? "Enviado"
                : r.deliveryStatus === "FAILED"
                  ? "Falló: pendiente de reintento"
                  : r.deliveryStatus === "SENDING"
                    ? "Enviando"
                    : "Programado"}
            </p>
            {r.deliveryStatus === "FAILED" && (
              <button
                className={`${clinicalSecondary} mt-2`}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.post(`/reminders/${r.id}/retry`);
                    await reload();
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "No se pudo reprogramar",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Programar reintento
              </button>
            )}
          </div>
        ))}
        {data && !data.reminders.length && (
          <p className="text-sm text-nexus-muted">Sin recordatorios.</p>
        )}
      </div>
    </section>
  );
}
