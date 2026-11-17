'use client';

import { useEffect, type ReactNode } from 'react';

import { Glass } from './glass';
import styles from './sheet.module.css';

/** Glass sheet drawer/dialog. `level="modal"` for confirm and pay dialogs. Esc closes. */
export function Sheet({
  open,
  onClose,
  title,
  level = 'sheet',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  level?: 'sheet' | 'modal';
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={styles.scrim} onMouseDown={onClose}>
      <Glass
        level={level}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={styles.sheet}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={styles.grabber} aria-hidden />
        {children}
      </Glass>
    </div>
  );
}
