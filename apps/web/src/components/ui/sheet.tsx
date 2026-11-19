'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './button';
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
  /** `center` (default) for a dialog, `bottom` for a draggable sheet, `right` for a side drawer that overlaps the page. */
  placement?: 'bottom' | 'center' | 'right';
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
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  if (!open) return null;
  // Portal to <body>: a Sheet opened from inside a glass drawer (backdrop-filter) would otherwise be
  // positioned relative to that drawer instead of the viewport.
  return createPortal(
    <div className={`${styles.scrim} ${styles[placement]}`} onMouseDown={onClose}>
      <Glass
        ref={panel}
        tabIndex={-1}
        level={level}
        solid={placement === 'right'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={styles.sheet}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {placement === 'bottom' ? (
          <div
            className={styles.grabZone}
            aria-hidden
            onPointerDown={(e) => {
              start.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current));
            }}
            onPointerUp={() => {
              start.current = null;
              const close = drag > 100;
              setDrag(0);
              if (close) onClose();
            }}
            onPointerCancel={() => {
              start.current = null;
              setDrag(0);
            }}
          >
            <span className={styles.grabber} />
          </div>
        ) : null}
        {placement !== 'bottom' ? (
          <IconButton
            icon="x"
            label={`Close ${title.toLowerCase()}`}
            className={styles.close}
            onClick={onClose}
          />
        ) : null}
        {children}
      </Glass>
    </div>,
    document.body,
  );
}
