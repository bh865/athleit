'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import { Glass } from './glass';
import styles from './popover.module.css';

/**
 * Anchored popover: opaque (never lets text behind it show through), flips above the trigger when
 * there is no room below, closes on Escape or outside press and returns focus to the trigger.
 */
export function Popover({
  open,
  onClose,
  anchor,
  label,
  children,
  align = 'start',
}: {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [shift, setShift] = useState(0);

  const close = useCallback(() => {
    onClose();
    anchor.current?.focus();
  }, [onClose, anchor]);

  useLayoutEffect(() => {
    if (!open || !panel.current || !anchor.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const room = window.innerHeight - a.bottom;
    setPlacement(room < p.height + 16 && a.top > room ? 'above' : 'below');
    const overflow = a.left + p.width - (window.innerWidth - 8);
    setShift(overflow > 0 ? -overflow : 0);
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, close, anchor]);

  if (!open) return null;
  return (
    <Glass
      solid
      level="modal"
      ref={panel as never}
      role="dialog"
      aria-label={label}
      data-placement={placement}
      className={[styles.popover, align === 'end' ? styles.end : ''].join(' ')}
      style={{ translate: shift ? `${shift}px 0` : undefined }}
    >
      {children}
    </Glass>
  );
}
