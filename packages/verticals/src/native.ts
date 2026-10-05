import type { VerticalManifest } from "./manifest";

export type ExpoPlugin = string | [string, Record<string, unknown>];
export interface NativePermissions {
  plugins: ExpoPlugin[];
  androidPermissions: string[];
  /** Capacidades declaradas pero todavía no implementadas en el cliente nativo. */
  planned: string[];
}

/** Opciones extra por plugin que no dependen de la vertical. */
const PLUGIN_DEFAULTS: Record<string, Record<string, unknown>> = {
  "expo-speech-recognition": { androidSpeechServicePackages: ["com.google.android.as", "com.google.android.googlequicksearchbox"] },
  // El plugin de expo-calendar siempre declara Recordatorios en iOS; sin esto quedaría su texto en inglés.
  "expo-calendar": { remindersPermission: "Nexus no lee ni modifica tus Recordatorios: solo usa el calendario para tus turnos." },
  // Solo «mientras se usa la app»: sin ubicación en segundo plano ni sensores de movimiento.
  "expo-location": { locationAlwaysAndWhenInUsePermission: false, locationAlwaysPermission: false, motionUsagePermission: false },
};

/**
 * Deriva los permisos nativos (plugins de Expo y permisos Android) de las
 * capacidades implementadas del manifiesto. Las justificaciones que ve el
 * usuario en iOS salen de `capability.rationale`: una sola fuente de verdad.
 */
export function nativePermissions(manifest: VerticalManifest): NativePermissions {
  const byPlugin = new Map<string, Record<string, unknown>>();
  const android = new Set<string>();
  const planned: string[] = [];
  for (const c of manifest.capabilities) {
    if (c.status !== "implemented") {
      planned.push(c.id);
      continue;
    }
    for (const p of c.android.permissions) android.add(p);
    if (!c.expoPlugin) continue;
    const opts = byPlugin.get(c.expoPlugin.name) ?? { ...PLUGIN_DEFAULTS[c.expoPlugin.name] };
    if (c.expoPlugin.option) opts[c.expoPlugin.option] = c.rationale;
    byPlugin.set(c.expoPlugin.name, opts);
  }
  const plugins: ExpoPlugin[] = [...byPlugin.entries()].map(([name, opts]) => (Object.keys(opts).length ? [name, opts] : name));
  return { plugins, androidPermissions: [...android].sort(), planned };
}

interface ExpoConfig {
  expo: {
    plugins?: ExpoPlugin[];
    android?: { permissions?: string[]; [k: string]: unknown };
    [k: string]: unknown;
  };
}

/** Aplica los permisos de la vertical a un app.json conservando el resto. */
export function applyNativePermissions(config: ExpoConfig, manifest: VerticalManifest): ExpoConfig {
  const native = nativePermissions(manifest);
  const managed = new Set(native.plugins.map((p) => (Array.isArray(p) ? p[0] : p)));
  const kept = (config.expo.plugins ?? []).filter((p) => !managed.has(Array.isArray(p) ? p[0] : p));
  return {
    ...config,
    expo: {
      ...config.expo,
      plugins: [...kept, ...native.plugins],
      android: { ...config.expo.android, permissions: native.androidPermissions },
    },
  };
}
