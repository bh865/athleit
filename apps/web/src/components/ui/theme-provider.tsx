'use client';

import type { ThemeMode } from '@athleit/tokens';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { REDUCE_TRANSPARENCY_KEY, THEME_KEY } from './theme-script';

// A tiny localStorage-backed store so React state and the DOM attributes agree
// without setState-in-effect, and so it stays in sync across tabs.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the choice just won't persist.
  }
  listeners.forEach((l) => l());
};

interface ThemeContextValue {
  /** The user's choice: light, dark, or follow the OS. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** App-level override that forces solid (non-glass) surfaces even if the OS allows transparency. */
  reduceTransparency: boolean;
  setReduceTransparency: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(THEME_KEY, 'system'),
    () => 'system',
  );
  const mode: ThemeMode = stored === 'light' || stored === 'dark' ? stored : 'system';
  const reduceTransparency =
    useSyncExternalStore(
      subscribe,
      () => read(REDUCE_TRANSPARENCY_KEY, 'false'),
      () => 'false',
    ) === 'true';

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    if (reduceTransparency) root.dataset.reduceTransparency = 'true';
    else delete root.dataset.reduceTransparency;
  }, [reduceTransparency]);

  const setMode = useCallback((next: ThemeMode) => write(THEME_KEY, next), []);
  const setReduceTransparency = useCallback(
    (v: boolean) => write(REDUCE_TRANSPARENCY_KEY, String(v)),
    [],
  );

  const value = useMemo(
    () => ({ mode, setMode, reduceTransparency, setReduceTransparency }),
    [mode, setMode, reduceTransparency, setReduceTransparency],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
