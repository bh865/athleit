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

import { createPortal } from 'react-dom';

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => {
    onClose();
    anchor.current?.focus();
  }, [onClose, anchor]);

  // Fixed + portalled so a popover is never clipped by a sheet or scroll container; re-placed on scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!panel.current || !anchor.current) return;
      const a = anchor.current.getBoundingClientRect();
      const p = panel.current.getBoundingClientRect();
      const gap = 8;
      const room = window.innerHeight - a.bottom;
      const above = room < p.height + gap * 2 && a.top > room;
      const top = above ? Math.max(gap, a.top - p.height - gap) : a.bottom + gap;
      const wanted = align === 'end' ? a.right - p.width : a.left;
      const left = Math.min(Math.max(gap, wanted), window.innerWidth - p.width - gap);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, align]);

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
  return createPortal(
    <Glass
      solid
      level="modal"
      ref={panel}
      role="dialog"
      aria-label={label}
      className={styles.popover}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        opacity: pos ? 1 : 0,
        pointerEvents: pos ? undefined : 'none',
      }}
    >
      {children}
    </Glass>,
    document.body,
  );
}
