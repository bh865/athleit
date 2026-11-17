'use client';

import type { StatusTone } from '@athleit/ui-core';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { Glass } from './glass';
import { Icon } from './icon';
import styles from './toast.module.css';

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
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: StatusTone = 'success') => {
    const id = nextId++;
    setItems((cur) => [...cur, { id, tone, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), DURATION_MS);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => (
          <Glass key={t.id} level="sheet" className={styles.toast}>
            <span className={styles[t.tone]}>
              <Icon
                name={
                  t.tone === 'success'
                    ? 'check-circle'
                    : t.tone === 'neutral'
                      ? 'bell'
                      : 'warning-circle'
                }
                weight="fill"
              />
            </span>
            {t.message}
          </Glass>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
