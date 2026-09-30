"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { createLatestRequest } from "./latestRequest";

export function useApiData<T>(path: string) {
  const requests = useRef(createLatestRequest());
  const activePath = useRef(path);
  activePath.current = path;
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ path, data: null, loading: true, error: null });

  const reload = useCallback(async () => {
    if (activePath.current !== path) return;
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : null,
      loading: true,
      error: null,
    }));
    await requests.current.run(
      () => api.get<T>(path),
      (result) => {
        if (activePath.current !== path) return;
        setState({
          path,
          data: "data" in result ? result.data : null,
          loading: false,
          error: "error" in result ? "No se pudo cargar la información." : null,
        });
      },
    );
  }, [path]);

  useEffect(() => {
    void reload();
    const activeRequests = requests.current;
    return () => activeRequests.invalidate();
  }, [reload]);

  // Hide the previous patient's data in the render preceding the new effect.
  const current =
    state.path === path ? state : { data: null, loading: true, error: null };
  return { ...current, reload };
}
