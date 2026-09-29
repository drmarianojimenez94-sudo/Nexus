import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * The native app has no browser cookie jar, so it stores the access +
 * refresh tokens itself — in expo-secure-store, which is Keychain on iOS
 * and Keystore-backed EncryptedSharedPreferences on Android. That's the OS
 * equivalent of what an httpOnly cookie buys the web app: page code can't
 * read Keychain items either, only this module can.
 *
 * expo-secure-store has no web implementation at all (there's no OS
 * keychain in a browser) — it throws rather than no-oping. Web is not a
 * target platform for NEXUS mobile, but `expo start --web` is still a
 * useful quick way to sanity-check screens without a simulator, so this
 * falls back to localStorage there instead of crashing the whole app.
 */
const ACCESS_TOKEN_KEY = "nexus_access_token";
const REFRESH_TOKEN_KEY = "nexus_refresh_token";

const webStore = {
  async set(key: string, value: string) {
    globalThis.localStorage?.setItem(key, value);
  },
  async get(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async delete(key: string) {
    globalThis.localStorage?.removeItem(key);
  },
};

const store = Platform.OS === "web" ? webStore : { set: SecureStore.setItemAsync, get: SecureStore.getItemAsync, delete: SecureStore.deleteItemAsync };

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([store.set(ACCESS_TOKEN_KEY, accessToken), store.set(REFRESH_TOKEN_KEY, refreshToken)]);
}

export async function getAccessToken(): Promise<string | null> {
  return store.get(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return store.get(REFRESH_TOKEN_KEY);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([store.delete(ACCESS_TOKEN_KEY), store.delete(REFRESH_TOKEN_KEY)]);
}
