'use client';

import { friendlyError } from '@athleit/core';
import type { Result } from '@athleit/db/api';
import { useCallback, useEffect, useRef, useState } from 'react';

type Loader<T> = () => PromiseLike<Result<T>>;
interface Settled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * Load data when `deps` change (and on `reload()`), exposing loading / error / data so every
 * list can show all three states. Stale responses from an earlier key are ignored.
 */
export function useLoad<T>(loader: Loader<T>, deps: readonly unknown[]) {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const latest = useRef(loader);
  useEffect(() => {
    latest.current = loader;
  });

  const key = JSON.stringify([...deps, tick]);
  useEffect(() => {
    let live = true;
    Promise.resolve(latest.current()).then((res) => {
      if (!live) return;
      setSettled(
        res.error
          ? { key, data: null, error: friendlyError(res.error) }
          : { key, data: res.data, error: null },
      );
    });
    return () => {
      live = false;
    };
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = settled?.key !== key;
  return {
    data: loading ? (settled?.data ?? null) : (settled?.data ?? null),
    error: loading ? null : (settled?.error ?? null),
    loading,
    reload,
  };
}
