import { describe, expect, it } from 'vitest';

import { createChunkedStorage, type KeyValueBackend } from './chunked-storage';

function memoryBackend() {
  const map = new Map<string, string>();
  const backend: KeyValueBackend = {
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => void map.set(k, v),
    remove: async (k) => void map.delete(k),
  };
  return { map, backend };
}

describe('createChunkedStorage', () => {
  it('stores short values under the plain key', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 10);
    await s.setItem('k', 'short');
    expect([...map.keys()]).toEqual(['k']);
    expect(await s.getItem('k')).toBe('short');
  });

  it('round-trips values larger than the chunk size', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 10);
    const value = JSON.stringify({ access_token: 'x'.repeat(95), note: 'ünïcode ✓' });
    await s.setItem('sb-auth', value);
    expect(map.has('sb-auth')).toBe(false);
    expect(await s.getItem('sb-auth')).toBe(value);
    expect([...map.values()].every((v) => v.length <= 10)).toBe(true);
  });

  it('cleans up stale chunks when a value shrinks or is removed', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 4);
    await s.setItem('k', 'abcdefghijkl');
    await s.setItem('k', 'xy');
    expect([...map.keys()]).toEqual(['k']);
    await s.removeItem('k');
    expect(map.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });

  it('returns null for a torn write (missing chunk)', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 4);
    await s.setItem('k', 'abcdefghijkl');
    map.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });
});
