import type { PublicUser } from "@nexus/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setApiSessionOwner } from "./api";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./tokenStore";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setSessionUser] = useState<PublicUser | null>(null);
  // El id del usuario viaja como X-Nexus-Owner en las rutas clínicas.
  function setUser(next: PublicUser | null) {
    setApiSessionOwner(next?.id ?? null);
    setSessionUser(next);
  }
  const [loading, setLoading] = useState(true);

  async function loadFromStoredSession() {
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api.get<{ user: PublicUser }>("/auth/me");
      setUser(me);
    } catch {
      // Bearer token rejected and the request.ts refresh retry also failed
      // — the stored session is dead, so clear it instead of retrying forever.
      await clearTokens();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFromStoredSession();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ user: PublicUser } & AuthTokens>("/auth/login", { email, password });
    await saveTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
  }

  async function register(name: string, email: string, password: string) {
    const res = await api.post<{ user: PublicUser } & AuthTokens>("/auth/register", { name, email, password });
    await saveTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
  }

  async function logout() {
    const refreshToken = await getRefreshToken();
    // Even if the server call fails (offline, already revoked), the device
    // still forgets the session locally — never strand the user logged in
    // with a token the server no longer honors.
    await api.post("/auth/logout", refreshToken ? { refreshToken } : undefined).catch(() => undefined);
    await clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
