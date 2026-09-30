export type ThemeMode =
  "adaptive" | "time" | "sections" | "gold" | "green" | "cyan" | "violet";
export type ThemeAccent = "gold" | "green" | "cyan" | "violet";
export function accentFor(
  path: string,
  hour: number,
  mode: ThemeMode,
): ThemeAccent {
  if (["gold", "green", "cyan", "violet"].includes(mode))
    return mode as ThemeAccent;
  const byTime: ThemeAccent =
    hour >= 5 && hour < 12
      ? "gold"
      : hour >= 12 && hour < 19
        ? "cyan"
        : "violet";
  if (mode === "time") return byTime;
  if (path.startsWith("/patients")) return "green";
  if (path.startsWith("/calendar")) return "gold";
  if (path.startsWith("/projects")) return "violet";
  if (path.startsWith("/memory") || path.startsWith("/areas")) return "cyan";
  return mode === "sections" ? "cyan" : byTime;
}
