export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Always same-origin: the browser calls /api/*, and the Next.js server
 * rewrites it to the real backend (next.config.mjs, BACKEND_INTERNAL_URL).
 * This matters beyond convenience — if api and web were ever deployed on
 * different subdomains of a shared PaaS domain (onrender.com, vercel.app,
 * etc.), those subdomains are "different sites" for cookie purposes on
 * most such platforms, and the sameSite=lax session cookie would never
 * reach a cross-site fetch. Routing everything through one origin avoids
 * that failure mode entirely, in dev and in production alike.
 */
let refreshInFlight: Promise<boolean> | null = null;
let sessionOwner: string | null = null;
export function setApiSessionOwner(userId: string | null) {
  sessionOwner = userId;
}
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}
async function request<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  if (path.startsWith("/clinical/") && !retried) {
    if (!sessionOwner)
      throw new ApiError(401, "Volvé a ingresar antes de abrir el consultorio");
    options = {
      ...options,
      headers: { ...options.headers, "X-Nexus-Owner": sessionOwner },
    };
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // An expired short-lived access cookie should not end a consultation.
  // Retry only a 401 (authentication runs before mutations), never a 5xx.
  if (
    res.status === 401 &&
    !retried &&
    (!path.startsWith("/auth/") || path === "/auth/me") &&
    (await refreshSession())
  ) {
    return request<T>(path, options, true);
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

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
