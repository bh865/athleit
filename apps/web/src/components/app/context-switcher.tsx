'use client';

import { contextPath, switcherPlaces, type AddRoleAction } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Glass, Icon } from '@/components/ui';

import { useApp } from './app-provider';
import styles from './context-switcher.module.css';

export const ADD_LABEL: Record<AddRoleAction, { label: string; href: string }> = {
  'add-family': { label: 'Add a family', href: '/family/children/new' },
  'create-team': { label: 'Create a team', href: '/teams/new' },
  'create-club': { label: 'Create a club', href: '/clubs/new' },
  'join-team': { label: 'Join a team', href: '/join' },
};

/**
 * Switch between PLACES (teams and clubs). Roles show as a label ("Admin · Parent"). With exactly one
 * place there is nothing to switch, so it is a static header with no dropdown; "Add a team / club /
 * family" also lives in the account menu so single-place users can still reach it.
 */
export function ContextSwitcher() {
  const { contexts, active, setActive, addActions } = useApp();
  const places = switcherPlaces(contexts);
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

  if (places.length <= 1) {
    return (
      <div className={styles.root}>
        <div className={`${styles.trigger} ${styles.static}`} data-testid="context-switcher">
          <span className={styles.text}>
            <span className={styles.title}>{active?.title ?? 'Get started'}</span>
            <span className={styles.subtitle}>
              {active?.subtitle ?? 'Add a team or family below'}
            </span>
          </span>
        </div>
      </div>
    );
  }

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
        <Icon name="caret-up-down" />
      </button>
      {open && (
        <Glass solid level="modal" className={styles.menu} role="menu">
          {places.map((c) => (
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
              {c.key === active?.key && <Icon name="check" weight="fill" size="sm" />}
            </button>
          ))}
          <p className={styles.heading}>Add</p>
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
              <span className={styles.addIcon}>
                <Icon name="plus" size="sm" />
              </span>
              <span className={styles.title}>{ADD_LABEL[a].label}</span>
            </button>
          ))}
        </Glass>
      )}
    </div>
  );
}
