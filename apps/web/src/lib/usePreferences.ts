"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type PreferenceMap = Record<string, unknown>;

/** Server-synced settings — deliberately not localStorage, so "already saw
 * the onboarding tour" (and anything else stored here later) follows the
 * account across iPhone/Windows/whatever client, not just this browser. */
export function usePreferences() {
  const [preferences, setPreferences] = useState<PreferenceMap | null>(null);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: unknown }>)
        .detail;
      setPreferences((prev) => ({
        ...(prev ?? {}),
        [detail.key]: detail.value,
      }));
    };
    window.addEventListener("nexus-preference", changed);
    api
      .get<{ preferences: PreferenceMap }>("/preferences")
      .then((res) => setPreferences(res.preferences))
      .catch(() => setPreferences({}));
    return () => window.removeEventListener("nexus-preference", changed);
  }, []);

  const setPreference = useCallback(async (key: string, value: unknown) => {
    await api.put(`/preferences/${key}`, { value });
    setPreferences((prev) => ({ ...(prev ?? {}), [key]: value }));
    window.dispatchEvent(
      new CustomEvent("nexus-preference", { detail: { key, value } }),
    );
  }, []);

  return { preferences, setPreference, loading: preferences === null };
}
