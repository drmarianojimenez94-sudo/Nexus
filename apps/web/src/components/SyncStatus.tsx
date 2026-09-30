"use client";
import { useEffect, useState } from "react";
import {
  claimLegacyCaptures,
  flushOfflineQueue,
  hasLegacyCaptures,
  pendingCaptureCount,
} from "@/lib/offlineQueue";
export function SyncStatus({ userId }: { userId: string }) {
  const [count, setCount] = useState(0),
    [legacy, setLegacy] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const update = () => {
      setCount(pendingCaptureCount(userId));
      try {
        setLegacy(hasLegacyCaptures());
      } catch {
        setMessage("El almacenamiento local no está disponible");
      }
    };
    update();
    window.addEventListener("nexus-offline-queue", update);
    return () => window.removeEventListener("nexus-offline-queue", update);
  }, [userId]);
  if (!count && !legacy && !message) return null;
  return (
    <section className="mb-4 rounded-xl border border-nexus-amber/40 p-3 text-sm">
      <p>
        {count < 0
          ? "No se pudo leer la cola local. Se conserva para recuperación."
          : `${count} capturas personales pendientes de sincronización`}
      </p>
      {message && (
        <p role="status" className="mt-2">
          {message}
        </p>
      )}
      {count > 0 && (
        <button
          disabled={busy}
          className="mt-2 text-nexus-cyan"
          onClick={async () => {
            setBusy(true);
            const r = await flushOfflineQueue(userId);
            setCount(r.remaining);
            setMessage(
              r.remaining
                ? "Quedan capturas pendientes. Revisá la conexión y tu sesión."
                : "Capturas sincronizadas",
            );
            setBusy(false);
          }}
        >
          Reintentar sincronización
        </button>
      )}
      {legacy && (
        <div className="mt-2">
          <p>
            Hay capturas de una versión anterior sin propietario identificado.
          </p>
          <button
            disabled={busy}
            className="mt-2 text-nexus-cyan"
            onClick={() => {
              if (
                window.confirm(
                  "¿Estas capturas anteriores pertenecen a tu cuenta? Solo se vincularán si lo confirmás.",
                )
              ) {
                if (claimLegacyCaptures(userId)) {
                  setLegacy(false);
                  setCount(pendingCaptureCount(userId));
                } else
                  setMessage(
                    "No se pudo recuperar la cola anterior. Los datos se conservaron.",
                  );
              }
            }}
          >
            Vincular mis capturas anteriores
          </button>
        </div>
      )}
    </section>
  );
}
