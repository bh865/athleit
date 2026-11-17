'use client';

import { contextPath, type AddRoleAction } from '@athleit/core';
import { CaretUpDown, Check, Plus } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useApp } from './app-provider';
import styles from './context-switcher.module.css';

const ADD_LABEL: Record<AddRoleAction, { label: string; href: string }> = {
  'add-family': { label: 'Add a family', href: '/family/children/new' },
  'create-team': { label: 'Create a team', href: '/teams/new' },
  'create-club': { label: 'Create a club', href: '/clubs/new' },
  'join-team': { label: 'Join a team', href: '/join' },
};

/** Switch between roles and places ("Parent, family", "Coach, U10 Hawks", "Admin, Riverside"). */
export function ContextSwitcher() {
  const { contexts, active, setActive, addActions } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={root}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="context-switcher"
      >
        <span className={styles.text}>
          <span className={styles.title}>{active?.title ?? 'Get started'}</span>
          <span className={styles.subtitle}>{active?.subtitle ?? 'Choose a role'}</span>
        </span>
        <CaretUpDown size={20} aria-hidden />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {contexts.map((c) => (
            <button
              key={c.key}
              type="button"
              role="menuitemradio"
              aria-checked={c.key === active?.key}
              className={styles.option}
              onClick={() => {
                setActive(c.key);
                setOpen(false);
                router.push(contextPath(c));
              }}
            >
              <span className={styles.text}>
                <span className={styles.title}>{c.title}</span>
                <span className={styles.subtitle}>{c.subtitle}</span>
              </span>
              {c.key === active?.key && <Check size={18} weight="bold" aria-hidden />}
            </button>
          ))}
          <p className={styles.heading}>Add a role</p>
          {addActions.map((a) => (
            <button
              key={a}
              type="button"
              role="menuitem"
              className={styles.option}
              onClick={() => {
                setOpen(false);
                router.push(ADD_LABEL[a].href);
              }}
            >
              <Plus size={18} aria-hidden />
              <span className={styles.title}>{ADD_LABEL[a].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
