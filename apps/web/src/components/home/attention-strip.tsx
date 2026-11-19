'use client';

import {
  attentionActionLabel,
  attentionChip,
  friendlyError,
  type AttentionItem,
  type AttentionKind,
  type AttentionResult,
} from '@athleit/core';
import { decideJoinRequest, decidePlayerLoginClaim } from '@athleit/db/api';
import { setRsvp } from '@athleit/db/scheduling';
import type { IconName } from '@athleit/ui-core';
import Link from 'next/link';
import { useId, useState } from 'react';

import { useViewerZone } from '@/components/schedule/use-viewer-zone';
import {
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Sheet,
  Text,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './attention.module.css';

const ICON: Record<AttentionKind, IconName> = {
  rsvp: 'question',
  result: 'flag',
  payment: 'credit-card',
  waiver: 'warning',
  registrationStep: 'receipt',
  joinRequests: 'users-three',
  loginClaims: 'user',
  linkRequests: 'link',
  registrationsToDecide: 'clipboard-text',
  payouts: 'bank',
  setup: 'list-checks',
};

/** Trailing control(s) that settle one item: resolve in place where an action exists, else deep-link. */
function Actions({
  item,
  primary,
  onResolved,
}: {
  item: AttentionItem;
  primary: boolean;
  onResolved: (key: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = item.action;

  async function run(job: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError(null);
    const res = await job();
    setBusy(false);
    if (res.error) setError(friendlyError(res.error as never));
    else onResolved(item.key);
  }

  if (a?.type === 'rsvp')
    return (
      <>
        <Button
          variant={primary ? 'primary' : 'secondary'}
          loading={busy}
          aria-label={`${a.firstName}: Going`}
          onClick={() => run(() => setRsvp(getClient(), a.eventId, a.playerId, 'going'))}
        >
          Going
        </Button>
        {error ? (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        ) : null}
      </>
    );
  if (a?.type === 'decide') {
    const decide = (approve: boolean) =>
      run(() =>
        a.what === 'join'
          ? decideJoinRequest(getClient(), a.id, approve)
          : decidePlayerLoginClaim(getClient(), a.id, approve),
      );
    return (
      <>
        <Button
          variant={primary ? 'primary' : 'secondary'}
          loading={busy}
          onClick={() => decide(true)}
        >
          Approve
        </Button>
        <Button variant="ghost" loading={busy} onClick={() => decide(false)}>
          Decline
        </Button>
        {error ? (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        ) : null}
      </>
    );
  }
  return (
    <ButtonLink href={item.href} variant={primary ? 'primary' : 'secondary'}>
      {attentionActionLabel(item)}
    </ButtonLink>
  );
}

/** A time-pressure chip: icon and words together, so urgency never depends on colour. */
function Chip({ item, now, zone }: { item: AttentionItem; now: Date; zone: string }) {
  const chip = attentionChip(item, now, zone);
  if (!chip) return null;
  return (
    <span className={`${styles.chip} ${styles[chip.tone]}`}>
      <Icon name={chip.icon} weight="fill" size="sm" />
      {chip.text}
    </span>
  );
}

function Row({
  item,
  now,
  zone,
  lead,
  onResolved,
}: {
  item: AttentionItem;
  now: Date;
  zone: string;
  lead?: boolean;
  onResolved: (key: string) => void;
}) {
  return (
    <div className={lead ? styles.lead : styles.row} data-testid="attention-row">
      <span className={lead ? styles.leadIcon : styles.icon} aria-hidden>
        <Icon name={ICON[item.kind]} weight={lead ? 'fill' : 'regular'} size={lead ? 'lg' : 'md'} />
      </span>
      <div className={styles.text}>
        {lead ? <span className={styles.kicker}>Most urgent</span> : null}
        <span className={lead ? styles.leadTitle : styles.title}>
          <Link href={item.href} className={styles.titleLink}>
            {item.label}
          </Link>
          {item.placeTag ? <span className={styles.tag}>{item.placeTag}</span> : null}
        </span>
        {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
        <Chip item={item} now={now} zone={zone} />
      </div>
      <div className={styles.actions}>
        <Actions item={item} primary={Boolean(lead)} onResolved={onResolved} />
      </div>
    </div>
  );
}

/**
 * "Needs your attention", Direction B: the most urgent item as a lead row, the rest as a quiet list (at most 4
 * rows, then "+N more" in a Sheet). One merged list for dual roles, each row with a place tag. States: loading
 * skeleton, error with retry, and a quiet "all caught up" line. Order: title, chip, actions left to right, "+N more".
 */
export function AttentionStrip({
  attention,
  loading,
  error,
  onRetry,
  onResolved,
  now,
}: {
  attention: AttentionResult;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Called after an in-place action so the list refetches. */
  onResolved: () => void;
  now: Date;
}) {
  const zone = useViewerZone() ?? 'UTC';
  const headId = useId();
  const [open, setOpen] = useState(false);
  // Hide a settled item at once; the refetch removes it for good.
  const [settled, setSettled] = useState<{ keys: ReadonlySet<string>; of: AttentionResult }>({
    keys: new Set(),
    of: attention,
  });
  // Only valid for the list it was recorded against: a refetch yields a new list, so a later item with the same key shows.
  const done: ReadonlySet<string> = settled.of === attention ? settled.keys : new Set();
  const settle = (key: string) => {
    setSettled({ keys: new Set(done).add(key), of: attention });
    onResolved();
  };
  const shown = attention.shown.filter((i) => !done.has(i.key));
  const more = attention.more.filter((i) => !done.has(i.key));
  const total = shown.length + more.length;
  const [lead, ...rest] = shown;

  return (
    <section
      aria-labelledby={headId}
      className={styles.section}
      data-testid="home-attention"
      aria-busy={loading || undefined}
    >
      <div className={styles.head}>
        <h2 id={headId} className={styles.heading}>
          Needs your attention
        </h2>
        {total > 0 ? (
          <span className={styles.count} aria-label={`${total} need you`}>
            {total}
          </span>
        ) : null}
      </div>
      {total === 0 && loading ? (
        <Card className={styles.panel}>
          <LoadingSkeleton rows={3} />
        </Card>
      ) : total === 0 && error ? (
        <Card className={styles.panel}>
          <ErrorState message="Couldn’t load what needs you." onRetry={onRetry} />
        </Card>
      ) : total === 0 ? (
        <p className={styles.clear} data-testid="home-caught-up">
          <Icon name="check-circle" weight="fill" /> You’re all caught up
        </p>
      ) : (
        <>
          {lead ? (
            <Card className={styles.leadCard}>
              <Row item={lead} now={now} zone={zone} lead onResolved={settle} />
            </Card>
          ) : null}
          {rest.length > 0 || more.length > 0 ? (
            <Card className={styles.panel}>
              <ul className={styles.list}>
                {rest.map((i) => (
                  <li key={i.key}>
                    <Row item={i} now={now} zone={zone} onResolved={settle} />
                  </li>
                ))}
              </ul>
              {more.length > 0 ? (
                <Button variant="ghost" onClick={() => setOpen(true)}>
                  +{more.length} more
                </Button>
              ) : null}
            </Card>
          ) : null}
          {error ? (
            <p role="status" className={styles.partial}>
              Some items didn’t load.{' '}
              <button type="button" className={styles.retry} onClick={onRetry}>
                Retry
              </button>
            </p>
          ) : null}
        </>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Needs your attention">
        <Text variant="heading" as="h2">
          Needs your attention
        </Text>
        <ul className={styles.list}>
          {[...shown, ...more].map((i) => (
            <li key={i.key}>
              <Row item={i} now={now} zone={zone} onResolved={settle} />
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
