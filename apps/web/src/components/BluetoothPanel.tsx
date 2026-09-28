"use client";

import { useState } from "react";
import { usePreferences } from "@/lib/usePreferences";

const PREFERENCE_KEY = "bluetooth_devices";

interface PairedDevice {
  id: string;
  name: string;
}

/**
 * Best-effort direct Bluetooth pairing — works only where the browser
 * actually implements the Web Bluetooth API (Chrome/Edge on desktop or
 * Android). It is feature-detected, never faked: on iPhone
 * `navigator.bluetooth` simply doesn't exist, in any browser, because
 * Apple doesn't ship it in WebKit — no workaround changes that. The real
 * path for smart-home control from the iPhone is NEXUS Home (a hub like
 * Home Assistant), documented in docs/NEXUS_CONNECTORS.md; this panel is
 * a genuine bonus for whoever opens NEXUS from a supported browser, not
 * a promise that it works everywhere.
 */
export function BluetoothPanel() {
  const { preferences, setPreference } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const supported = typeof navigator !== "undefined" && "bluetooth" in navigator;
  const devices = (preferences?.[PREFERENCE_KEY] as PairedDevice[] | undefined) ?? [];

  async function pairDevice() {
    if (!navigator.bluetooth) return;
    setError(null);
    setPairing(true);
    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      const next = [...devices.filter((d) => d.id !== device.id), { id: device.id, name: device.name ?? "Dispositivo sin nombre" }];
      await setPreference(PREFERENCE_KEY, next);
    } catch (err) {
      // The user cancelling the browser's own device picker throws too —
      // that's not a real error, don't show one for it.
      if (err instanceof Error && err.name !== "NotFoundError") {
        setError("No se pudo emparejar. Probá de nuevo.");
      }
    } finally {
      setPairing(false);
    }
  }

  async function forget(id: string) {
    await setPreference(
      PREFERENCE_KEY,
      devices.filter((d) => d.id !== id)
    );
  }

  return (
    <section className="glass-panel p-4">
      <h2 className="mb-2 text-xs font-medium tracking-widest text-nexus-muted">DISPOSITIVOS BLUETOOTH</h2>

      {!supported ? (
        <p className="text-sm text-nexus-muted">
          Este navegador no soporta Bluetooth directo — en iPhone ningún navegador lo soporta, es una
          limitación de iOS, no de NEXUS. El camino real para smart home desde el celular es{" "}
          <span className="text-nexus-cyan">NEXUS Home</span> (Fase 4, vía un hub como Home Assistant).
          Si abrís NEXUS desde Chrome en Android o una PC, sí podés emparejar directo acá.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-nexus-muted">
            Emparejamiento directo (mejor esfuerzo, solo Chrome/Edge en desktop o Android).
          </p>
          <button
            onClick={() => void pairDevice()}
            disabled={pairing}
            className="mb-3 rounded-full bg-nexus-cyan px-4 py-1.5 text-sm font-medium text-nexus-bg disabled:opacity-40"
          >
            {pairing ? "Buscando…" : "+ Emparejar dispositivo"}
          </button>
          {error && <p className="mb-2 text-sm text-nexus-danger">{error}</p>}
          {devices.length > 0 && (
            <ul className="flex flex-col gap-1">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.name}</span>
                  <button onClick={() => void forget(d.id)} className="text-xs text-nexus-muted">
                    Olvidar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
