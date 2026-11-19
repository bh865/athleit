'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Glass } from './glass';
import styles from './sheet.module.css';

/** Glass sheet drawer/dialog. `level="modal"` for confirm and pay dialogs. Esc closes. */
export function Sheet({
  open,
  onClose,
  title,
  level = 'sheet',
  placement = 'center',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  level?: 'sheet' | 'modal';
  /** `side` slides in from the right edge, full height (checkout, receipt detail). Default is centered. */
  placement?: 'center' | 'side';
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Move focus into the dialog when it opens and give it back to whatever opened it when it closes.
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => trigger?.focus?.();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className={`${styles.scrim} ${placement === 'side' ? styles.scrimSide : ''}`}
      onMouseDown={onClose}
    >
      <Glass
        ref={panel}
        tabIndex={-1}
        level={level}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${styles.sheet} ${placement === 'side' ? styles.sheetSide : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={styles.grabber} aria-hidden />
        {children}
      </Glass>
    </div>
  );
}
