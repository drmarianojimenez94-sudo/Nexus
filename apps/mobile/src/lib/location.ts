import * as Location from "expo-location";

export interface Coords {
  lat: number;
  lon: number;
}

const FRESH_MS = 10 * 60_000;
let cached: { at: number; coords: Coords } | null = null;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Ubicación aproximada del teléfono (redondeada a ~1 km) para el clima «acá»
 * y las búsquedas cercanas. Pide permiso «mientras se usa la app» la primera
 * vez; si se niega o el GPS tarda, Nexus sigue sin ubicación.
 */
export async function currentLocation(timeoutMs = 5000): Promise<Coords | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.coords;
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted" && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: FRESH_MS });
    const position =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]));
    if (!position) return null;
    const coords = { lat: round(position.coords.latitude), lon: round(position.coords.longitude) };
    cached = { at: Date.now(), coords };
    return coords;
  } catch {
    return null;
  }
}
