import { createChunkedStorage, type KeyValueBackend } from '@athleit/core';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type WebStorage = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};
const webStorage = () => (globalThis as { localStorage?: WebStorage }).localStorage;

/** Keychain (iOS) / Keystore (Android) via expo-secure-store; localStorage only on Expo Web. */
export const secureBackend: KeyValueBackend =
  Platform.OS === 'web'
    ? {
        get: async (k) => webStorage()?.getItem(k) ?? null,
        set: async (k, v) => void webStorage()?.setItem(k, v),
        remove: async (k) => void webStorage()?.removeItem(k),
      }
    : {
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) => SecureStore.setItemAsync(k, v),
        remove: (k) => SecureStore.deleteItemAsync(k),
      };

/** Supabase session storage: chunked because a session exceeds SecureStore's ~2 KB value guidance. */
export const supabaseStorage = createChunkedStorage(secureBackend);
