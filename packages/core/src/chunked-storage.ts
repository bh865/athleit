/** Minimal async key-value backend (e.g. expo-secure-store). */
export interface KeyValueBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Shape expected by supabase-js `auth.storage` (a subset of SupportedStorage). */
export interface ChunkedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Wraps a size-limited backend so values of any length can be stored.
 * expo-secure-store recommends values under ~2 KB, but a Supabase session JSON is larger,
 * so long values are split into `<key>.0`, `<key>.1`, ... with the count in `<key>.n`.
 * Short values are stored as-is under `<key>`.
 */
export function createChunkedStorage(backend: KeyValueBackend, chunkSize = 1000): ChunkedStorage {
  const countKey = (key: string) => `${key}.n`;
  const chunkKey = (key: string, i: number) => `${key}.${i}`;

  async function removeItem(key: string) {
    const count = Number(await backend.get(countKey(key)));
    if (Number.isInteger(count) && count > 0) {
      await Promise.all(Array.from({ length: count }, (_, i) => backend.remove(chunkKey(key, i))));
    }
    await backend.remove(countKey(key));
    await backend.remove(key);
  }

  return {
    async getItem(key) {
      const rawCount = await backend.get(countKey(key));
      if (rawCount === null) return backend.get(key);
      const count = Number(rawCount);
      if (!Number.isInteger(count) || count < 1) return null;
      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => backend.get(chunkKey(key, i))),
      );
      // A missing chunk means a torn write; treat as no session rather than returning garbage.
      return parts.every((p): p is string => p !== null) ? parts.join('') : null;
    },

    async setItem(key, value) {
      await removeItem(key);
      if (value.length <= chunkSize) return backend.set(key, value);
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) ?? [];
      await Promise.all(chunks.map((chunk, i) => backend.set(chunkKey(key, i), chunk)));
      await backend.set(countKey(key), String(chunks.length));
    },

    removeItem,
  };
}
