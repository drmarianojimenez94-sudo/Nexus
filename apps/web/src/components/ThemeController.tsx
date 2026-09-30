"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { accentFor, type ThemeMode } from "@/lib/theme";
export function ThemeController({ mode }: { mode: unknown }) {
  const path = usePathname() || "/today";
  useEffect(() => {
    const valid: ThemeMode = [
      "adaptive",
      "time",
      "sections",
      "gold",
      "green",
      "cyan",
      "violet",
    ].includes(String(mode))
      ? (mode as ThemeMode)
      : "adaptive";
    const update = () => {
      document.documentElement.dataset.accent = accentFor(
        path,
        new Date().getHours(),
        valid,
      );
    };
    update();
    const timer = setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [path, mode]);
  return null;
}
