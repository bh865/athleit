'use client';

import type { ThemeMode } from '@athleit/tokens';
import { Desktop, Moon, Sun } from '@phosphor-icons/react';

import styles from './theme-toggle.module.css';
import { useTheme } from './theme-provider';

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Desktop },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={styles.group}>
      {OPTIONS.map(({ mode: m, label, Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={[styles.option, mode === m ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => setMode(m)}
        >
          <Icon size={18} weight={mode === m ? 'fill' : 'regular'} aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
