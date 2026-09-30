"use client";

import type { PublicUser } from "@nexus/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiError, api, setApiSessionOwner } from "./api";

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback((next: PublicUser | null) => {
    setApiSessionOwner(next?.id || null);
    setUser(next);
  }, []);

  useEffect(() => {
    api
      .get<{ user: PublicUser }>("/auth/me")
      .then((res) => applyUser(res.user))
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) {
          console.error(err);
        }
      })
      .finally(() => setLoading(false));
  }, [applyUser]);

  // Only a change notification is shared; tokens and personal data stay private.
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== "nexus_session_changed") return;
      applyUser(null);
      setLoading(true);
      api
        .get<{ user: PublicUser }>("/auth/me")
        .then((res) => applyUser(res.user))
        .catch(() => applyUser(null))
        .finally(() => setLoading(false));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [applyUser]);

  const notifySessionChange = useCallback(() => {
    try {
      localStorage.setItem("nexus_session_changed", crypto.randomUUID());
    } catch {
      /* owner header still prevents cross-account clinical requests */
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ user: PublicUser }>("/auth/login", {
        email,
        password,
      });
      applyUser(res.user);
      notifySessionChange();
    },
    [applyUser, notifySessionChange],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.post<{ user: PublicUser }>("/auth/register", {
        name,
        email,
        password,
      });
      applyUser(res.user);
      notifySessionChange();
    },
    [applyUser, notifySessionChange],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    applyUser(null);
    notifySessionChange();
  }, [applyUser, notifySessionChange]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
