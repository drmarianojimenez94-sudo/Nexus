"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";

interface Integration {
  provider: string;
  status: "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  errorMessage: string | null;
  updatedAt: string;
}

interface StatusResponse {
  googleConfigured: boolean;
  integrations: Integration[];
}

/** Reads the ?connected=/?google= params the OAuth callback redirects back with, then clears them from the URL. */
function OAuthResultBanner({ onResult }: { onResult: (message: string, isError: boolean) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const googleResult = searchParams.get("google");
    if (connected === "google_calendar") {
      onResult("Google Calendar conectado.", false);
      router.replace("/settings");
    } else if (googleResult === "denied") {
      onResult("Cancelaste la conexión con Google.", true);
      router.replace("/settings");
    } else if (googleResult === "error") {
      onResult("No se pudo conectar con Google. Probá de nuevo.", true);
      router.replace("/settings");
    }
  }, [searchParams, router, onResult]);

  return null;
}

export function IntegrationsPanel() {
  const { data, loading, reload } = useApiData<StatusResponse>("/connectors/status");
  const [banner, setBanner] = useState<{ message: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const google = data?.integrations.find((i) => i.provider === "google_calendar");

  async function connect() {
    setBusy(true);
    try {
      const { authUrl } = await api.get<{ authUrl: string }>("/connectors/google/authorize");
      window.location.href = authUrl;
    } catch (err) {
      setBanner({
        message: err instanceof ApiError && err.status === 501 ? "Google no está configurado en el servidor." : "No se pudo iniciar la conexión.",
        isError: true,
      });
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await api.post("/connectors/google_calendar/disconnect").catch(() => {});
    await reload();
    setBusy(false);
  }

  async function sync() {
    setBusy(true);
    setSyncResult(null);
    try {
      const res = await api.post<{ imported: number }>("/connectors/google/sync");
      setSyncResult(`${res.imported} evento${res.imported === 1 ? "" : "s"} sincronizado${res.imported === 1 ? "" : "s"}.`);
      await reload();
    } catch {
      setSyncResult("No se pudo sincronizar. Puede que haya que reconectar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-panel p-4">
      <Suspense fallback={null}>
        <OAuthResultBanner onResult={(message, isError) => setBanner({ message, isError })} />
      </Suspense>

      <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">INTEGRATIONS</h2>

      {banner && (
        <p className={`mb-3 text-sm ${banner.isError ? "text-nexus-danger" : "text-nexus-cyan"}`}>{banner.message}</p>
      )}

      {loading && <p className="text-sm text-nexus-muted">Cargando…</p>}

      {data && !data.googleConfigured && (
        <p className="text-sm text-nexus-muted">
          Google Calendar todavía no está configurado en este servidor — hace falta cargar
          <span className="text-nexus-cyan"> GOOGLE_CLIENT_ID</span>,
          <span className="text-nexus-cyan"> GOOGLE_CLIENT_SECRET</span> y
          <span className="text-nexus-cyan"> GOOGLE_REDIRECT_URI</span> como variables de entorno. Gmail, Contacts y
          Drive quedan para más adelante.
        </p>
      )}

      {data && data.googleConfigured && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Google Calendar</p>
              {google?.status === "CONNECTED" && <p className="text-xs text-nexus-cyan">Conectado</p>}
              {google?.status === "ERROR" && (
                <p className="text-xs text-nexus-danger">{google.errorMessage ?? "Hubo un error"}</p>
              )}
              {!google && <p className="text-xs text-nexus-muted">No conectado</p>}
            </div>
            {google ? (
              <div className="flex gap-2">
                <button
                  onClick={() => void sync()}
                  disabled={busy}
                  className="rounded-full border border-nexus-border px-3 py-1.5 text-xs text-nexus-cyan disabled:opacity-40"
                >
                  Sincronizar ahora
                </button>
                <button
                  onClick={() => void disconnect()}
                  disabled={busy}
                  className="rounded-full border border-nexus-border px-3 py-1.5 text-xs text-nexus-muted disabled:opacity-40"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <button
                onClick={() => void connect()}
                disabled={busy}
                className="rounded-full bg-nexus-cyan px-4 py-1.5 text-sm font-medium text-nexus-bg disabled:opacity-40"
              >
                Conectar
              </button>
            )}
          </div>
          {syncResult && <p className="text-xs text-nexus-muted">{syncResult}</p>}
        </div>
      )}
    </section>
  );
}
