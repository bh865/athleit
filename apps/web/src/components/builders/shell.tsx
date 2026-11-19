'use client';

import type { ReactNode } from 'react';

import { Badge, Icon, IconButton } from '@/components/ui';

import styles from './builders.module.css';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** The autosave pill every builder shows: Saving…, Saved, Unsaved changes, Not saved, or a problem count. */
export function SaveStatus({
  save,
  dirty,
  issues = 0,
  savedLabel = 'Saved',
  neverSaved = false,
}: {
  save: SaveState;
  dirty: boolean;
  issues?: number;
  savedLabel?: string;
  neverSaved?: boolean;
}) {
  if (save === 'saving') return <span className={styles.status}>Saving…</span>;
  if (issues > 0)
    return (
      <span className={`${styles.status} ${styles.statusBad}`}>
        <Icon name="warning" size="sm" /> {issues} {issues === 1 ? 'issue' : 'issues'}
      </span>
    );
  if (save === 'error')
    return <span className={`${styles.status} ${styles.statusBad}`}>Not saved</span>;
  if (neverSaved) return <span className={styles.status}>Not saved yet</span>;
  if (dirty)
    return (
      <span className={styles.status}>
        <Icon name="circle-dashed" size="sm" /> Unpublished changes
      </span>
    );
  return (
    <span className={styles.status}>
      <Icon name="check" size="sm" /> {savedLabel}
    </span>
  );
}

/**
 * The slim top bar the Waiver builder uses: back, editable title, a state badge, autosave status, and the
 * right-hand controls. The Registration and Form builders carry the same bar inline today and can adopt this one.
 */
export function BuilderTopBar({
  onBack,
  backLabel = 'Back',
  backIcon = 'arrow-left',
  title,
  onTitle,
  titleLabel,
  placeholder,
  maxLength,
  badge,
  status,
  children,
}: {
  onBack: () => void;
  backLabel?: string;
  backIcon?: 'arrow-left' | 'x';
  title: string;
  onTitle: (v: string) => void;
  titleLabel: string;
  placeholder: string;
  maxLength?: number;
  badge?: { label: string; tone?: 'neutral' | 'success' | 'warning' } | null;
  status: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={styles.top}>
      <IconButton icon={backIcon} label={backLabel} onClick={onBack} />
      <div className={styles.title}>
        <input
          className={styles.titleInput}
          aria-label={titleLabel}
          placeholder={placeholder}
          {...(maxLength ? { maxLength } : {})}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
        />
      </div>
      {badge ? <Badge tone={badge.tone ?? 'neutral'}>{badge.label}</Badge> : null}
      {status}
      <span className={styles.spacer} />
      {children}
    </div>
  );
}
