import { themes, type Theme, type ThemeMode } from '@athleit/tokens';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Appearance, Platform, useColorScheme } from 'react-native';

import { secureBackend } from '@/lib/secure-storage';

const MODE_KEY = 'athleit-theme-mode';
const REDUCE_KEY = 'athleit-reduce-transparency';

interface ThemeContextValue {
  theme: Theme;
  /** The user's choice: light, dark, or follow the system. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Effective setting: the OS "Reduce Transparency" preference (iOS) OR the in-app override. */
  reduceTransparency: boolean;
  /** In-app override that forces solid surfaces (also useful on low-end devices). */
  reduceTransparencyOverride: boolean;
  setReduceTransparencyOverride: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [override, setOverrideState] = useState(false);
  const [osReduce, setOsReduce] = useState(false);
  const systemScheme = useColorScheme();
  // Resolve from the saved mode directly (don't rely on setColorScheme changing useColorScheme).
  const scheme = mode === 'system' ? systemScheme : mode;

  // Restore saved preferences.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedMode, savedReduce] = await Promise.all([
        secureBackend.get(MODE_KEY),
        secureBackend.get(REDUCE_KEY),
      ]);
      if (cancelled) return;
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system')
        setModeState(savedMode);
      setOverrideState(savedReduce === 'true');
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Make native chrome (status bar, alerts, system blur tint) follow the chosen mode.
  useEffect(() => {
    // Not implemented by react-native-web, so guard it for the Expo Web preview.
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
    }
  }, [mode]);

  // iOS "Reduce Transparency" accessibility setting. (Android has no equivalent.)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((v) => mounted && setOsReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOsReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    secureBackend.set(MODE_KEY, next).catch(() => {});
  }, []);
  const setOverride = useCallback((next: boolean) => {
    setOverrideState(next);
    secureBackend.set(REDUCE_KEY, String(next)).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[scheme === 'dark' ? 'dark' : 'light'],
      mode,
      setMode,
      reduceTransparency: osReduce || override,
      reduceTransparencyOverride: override,
      setReduceTransparencyOverride: setOverride,
    }),
    [scheme, mode, setMode, osReduce, override, setOverride],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
