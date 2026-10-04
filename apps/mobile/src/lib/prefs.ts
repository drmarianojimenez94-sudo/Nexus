import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Preferencias chicas del dispositivo (voz silenciada, hora del resumen).
 * expo-secure-store ya está instalado y alcanza; en `expo start --web`
 * (solo para revisar pantallas) cae a localStorage, igual que tokenStore.
 */
const native = { get: SecureStore.getItemAsync, set: SecureStore.setItemAsync, delete: SecureStore.deleteItemAsync };
const web = {
  get: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  delete: async (key: string) => globalThis.localStorage?.removeItem(key),
};
const store = Platform.OS === "web" ? web : native;

export async function getPref(key: string): Promise<string | null> {
  try {
    return await store.get(`nexus_pref_${key}`);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await store.delete(`nexus_pref_${key}`);
    else await store.set(`nexus_pref_${key}`, value);
  } catch {
    // Una preferencia que no se guarda no debe romper la pantalla.
  }
}
