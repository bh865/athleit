'use client';

import { pageOf, type TeamAttentionRow, teamTabHref } from '@athleit/core';
import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconCircle,
  Sheet,
  TextField,
} from '@/components/ui';

import styles from './team.module.css';

/** Number + label tile used by Waivers and Registrations. `tone` colours the number; the label says what it is. */
export function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'bad' | 'warn' | 'ok';
}) {
  const toneClass =
    tone === 'bad'
      ? styles.tileBad
      : tone === 'warn'
        ? styles.tileWarn
        : tone === 'ok'
          ? styles.tileOk
          : '';
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={`${styles.tileValue} ${toneClass}`}>{value}</span>
      {note ? <span className={styles.muted}>{note}</span> : null}
    </div>
  );
}

const ATTENTION_ICON: Record<TeamAttentionRow['kind'], IconName> = {
  joinRequests: 'user-plus',
  waivers: 'shield-warning',
  registrations: 'clipboard-text',
  payments: 'credit-card',
};

/** One row of "Needs attention": icon, label, first names, count, and a link to the tab that fixes it. */
export function AttentionRow({ row, teamId }: { row: TeamAttentionRow; teamId: string }) {
  return (
    <Link href={teamTabHref(teamId, row.tab, row.view)} className={styles.attention}>
      <IconCircle>
        <Icon name={ATTENTION_ICON[row.kind]} />
      </IconCircle>
      <span className={styles.attentionText}>
        <span className={styles.attentionLabel}>{row.label}</span>
        {row.detail ? <span className={styles.muted}>{row.detail}</span> : null}
      </span>
      <Badge tone="count">{row.count}</Badge>
      <Icon name="caret-right" size="sm" />
    </Link>
  );
}

/** Skeleton rows shaped like the loaded rows (avatar and two lines). */
export function RowsSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div className={styles.skel} role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skelRow}>
          <span className={styles.skelDot} />
          <span className={styles.skelLines}>
            <span className={styles.skelLine} />
            <span className={styles.skelLine} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The four list states every Team details list uses: loading skeleton, empty (icon, one sentence, one primary
 * action), error with "Try again", and the loaded list.
 */
export function ListState({
  name,
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  /** Plural noun for messages, e.g. "members". */
  name: string;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  empty?: { when: boolean; icon: IconName; text: string; action?: ReactNode } | undefined;
  children: ReactNode;
}) {
  if (loading) return <RowsSkeleton label={`Loading ${name}`} />;
  if (error)
    return (
      <ErrorState
        message={`Can’t load ${name}. Check your connection and try again.`}
        onRetry={onRetry}
      />
    );
  if (empty?.when) return <EmptyState icon={empty.icon} title={empty.text} action={empty.action} />;
  return <>{children}</>;
}

/** Client-side paging, 25 at a time: "1–25 of 142" and a Show more button. */
export function useShowMore<T>(items: readonly T[], resetKey: string) {
  // The count resets whenever the filter or search changes, without an effect.
  const [state, setState] = useState({ key: resetKey, shown: 25 });
  const shown = state.key === resetKey ? state.shown : 25;
  const page = pageOf(items, shown);
  return { ...page, more: () => setState({ key: resetKey, shown: shown + 25 }) };
}

export function ShowMore({
  total,
  shown,
  remaining,
  onMore,
}: {
  total: number;
  shown: number;
  remaining: number;
  onMore: () => void;
}) {
  if (total <= 25) return null;
  return (
    <div className={styles.moreBar}>
      <span className={`${styles.muted} ${styles.mono}`}>
        1–{shown} of {total}
      </span>
      {remaining > 0 ? (
        <Button variant="secondary" onClick={onMore}>
          Show more
        </Button>
      ) : null}
    </div>
  );
}

export function SearchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      className={styles.search}
      label={label}
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
    />
  );
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className={`${styles.row} ${styles.between}`}>
      <h2 className={styles.section}>{title}</h2>
      {action}
    </div>
  );
}

export {
  agoLabel as ago,
  shortDateLabel as shortDate,
  matchesQuery as matches,
} from '@athleit/core';

/** Confirm dialog for removals and anything that cannot be undone. */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} level="modal">
      <div className={styles.stack}>
        <h2 className={styles.section}>{title}</h2>
        <p className={styles.muted}>{body}</p>
        <div className={styles.row}>
          <Button loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
