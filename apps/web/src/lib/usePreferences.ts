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
    api
      .get<{ preferences: PreferenceMap }>("/preferences")
      .then((res) => setPreferences(res.preferences))
      .catch(() => setPreferences({}));
  }, []);

  const setPreference = useCallback(async (key: string, value: unknown) => {
    setPreferences((prev) => ({ ...(prev ?? {}), [key]: value }));
    await api.put(`/preferences/${key}`, { value });
  }, []);

  return { preferences, setPreference, loading: preferences === null };
}
