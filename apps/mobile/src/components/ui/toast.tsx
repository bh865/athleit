import { radius, space } from '@athleit/tokens';
import type { StatusTone } from '@athleit/ui-core';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './glass';
import { Icon } from './icon';
import { Text } from './text';
import { useTheme } from './theme';

interface ToastItem {
  id: number;
  tone: StatusTone;
  message: string;
}
const ToastContext = createContext<((message: string, tone?: StatusTone) => void) | null>(null);
const DURATION_MS = 4000;
let nextId = 1;

/** Glass sheet pills with a fill status icon. Mount once near the app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: StatusTone = 'success') => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, tone, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), DURATION_MS);
  }, []);
  const value = useMemo(() => show, [show]);
  const color = {
    success: theme.color.ok,
    warning: theme.color.warn,
    danger: theme.color.bad,
    neutral: theme.color.ink,
  };
  return (
    <ToastContext value={value}>
      {children}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: insets.top + space[2],
          left: space[4],
          right: space[4],
          alignItems: 'center',
          gap: space[2],
        }}
      >
        {items.map((t) => (
          <Glass
            key={t.id}
            level="sheet"
            cornerRadius={radius.pill}
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              paddingVertical: space[3],
              paddingHorizontal: space[4],
            }}
          >
            <Icon
              name={
                t.tone === 'success'
                  ? 'check-circle'
                  : t.tone === 'neutral'
                    ? 'bell'
                    : 'warning-circle'
              }
              weight="fill"
              color={color[t.tone]}
            />
            <Text variant="bodyBold">{t.message}</Text>
          </Glass>
        ))}
      </View>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
