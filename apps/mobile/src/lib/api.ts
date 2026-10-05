import { getPref, setPref } from "./prefs";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./tokenStore";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Same public NEXUS deployment the web app uses — no separate mobile
 * backend or domain. The Express API sits behind the web app's own
 * /api/* proxy (next.config.mjs), and that proxy doesn't care whether the
 * request came from a browser or a native client, so the mobile app just
 * points at the same URL and reuses the same route prefix.
 */
// EXPO_PUBLIC_-prefixed vars are inlined into the JS bundle by Metro at
// build time (from a .env file at the project root) — Expo's standard
// mechanism for client-exposed config, no app.config indirection needed.
/** «nexus.onrender.com/» → «https://nexus.onrender.com». Vacío si no hay dirección real. */
export function normalizeServerUrl(raw: string): string {
  let url = raw.trim();
  if (!url || /REEMPLAZAR/i.test(url)) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "").replace(/\/api$/i, "");
}

/**
 * Dirección de tu Nexus (la misma de la web en Render). Viene del build
 * (EXPO_PUBLIC_API_URL) y se puede cambiar desde la pantalla de ingreso sin
 * volver a compilar: queda guardada en el teléfono.
 */
let apiBaseUrl = normalizeServerUrl(process.env.EXPO_PUBLIC_API_URL ?? "");
const SERVER_KEY = "server_url";
export const serverReady: Promise<void> = getPref(SERVER_KEY).then((saved) => {
  const url = saved ? normalizeServerUrl(saved) : "";
  if (url) apiBaseUrl = url;
});
export const getServerUrl = () => apiBaseUrl;

/** Prueba la dirección (que responda Nexus) y la guarda. Devuelve el error a mostrar, o null. */
export async function setServerUrl(raw: string): Promise<string | null> {
  const url = normalizeServerUrl(raw);
  if (!url) return "Escribí la dirección de tu Nexus, por ejemplo nexus-xxxx.onrender.com.";
  // Render gratis tarda hasta un minuto en despertar.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70_000);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (!res.ok || body?.status !== "ok") return "Esa dirección no parece ser un Nexus. Revisala (es la misma que usás en el navegador).";
  } catch {
    return "No pude conectarme. Revisá la dirección y la conexión. Si Render estaba dormido, esperá un minuto y probá de nuevo.";
  } finally {
    clearTimeout(timer);
  }
  apiBaseUrl = url;
  await setPref(SERVER_KEY, url);
  return null;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Igual que la web (apps/web/src/lib/api.ts): las rutas clínicas, de
 * verticales y de Google Workspace exigen `X-Nexus-Owner` = id del usuario
 * con sesión, para que una sesión cambiada nunca escriba en otra cuenta.
 */
const OWNER_PREFIXES = ["/clinical/", "/projects", "/tasks", "/google-workspace/", "/verticals/"];
let sessionOwner: string | null = null;
export function setApiSessionOwner(userId: string | null) {
  sessionOwner = userId;
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    await serverReady;
    const res = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nexus-Client": "mobile" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearTokens();
      return false;
    }
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    await saveTokens(body.accessToken, body.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function send(path: string, options: RequestInit, isRetry: boolean): Promise<Response> {
  const needsOwner = OWNER_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (needsOwner && !sessionOwner) throw new ApiError(401, "Volvé a ingresar antes de abrir el consultorio.");
  const accessToken = await getAccessToken();
  await serverReady;
  if (!apiBaseUrl) throw new ApiError(0, "Falta la dirección de tu Nexus: escribila en la pantalla de ingreso.");
  const res = await fetch(`${apiBaseUrl}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Nexus-Client": "mobile",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(needsOwner && sessionOwner ? { "X-Nexus-Owner": sessionOwner } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !isRetry) {
    // Single shared refresh attempt even if several requests 401 at once
    // (e.g. Today's aggregate calls), so a slightly-stale token doesn't
    // trigger a stampede of parallel /auth/refresh calls that would race
    // to rotate the same refresh token and fail each other.
    refreshInFlight ??= refreshSession().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) return send(path, options, true);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await send(path, options, false);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** POST que devuelve bytes (p. ej. el audio de /voice/tts). */
  postBinary: async (path: string, body?: unknown): Promise<ArrayBuffer> => {
    const res = await send(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, false);
    return res.arrayBuffer();
  },
};
