"use client";

export interface Coords {
  lat: number;
  lon: number;
}

let cached: { at: number; coords: Coords } | null = null;
const FRESH_MS = 10 * 60_000;

/**
 * Ubicación aproximada del teléfono (redondeada a ~1 km) para el clima y las
 * búsquedas cercanas. La primera vez el navegador pide permiso; si se niega o
 * tarda, Nexus sigue sin ubicación.
 */
export function currentLocation(timeoutMs = 4000): Promise<Coords | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return Promise.resolve(cached.coords);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        const coords = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
        cached = { at: Date.now(), coords };
        resolve(coords);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: FRESH_MS, timeout: timeoutMs },
    );
  });
}
