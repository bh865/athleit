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
import { Button, ButtonLink, Card, ErrorState, Icon, LoadingSkeleton } from '@/components/ui';
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

/** One condensed card in the swiper: icon and time chip, a two-line title, place and detail, then the action. */
function Slide({
  item,
  now,
  zone,
  lead,
  index,
  total,
  onResolved,
}: {
  item: AttentionItem;
  now: Date;
  zone: string;
  lead: boolean;
  index: number;
  total: number;
  onResolved: (key: string) => void;
}) {
  const meta = [item.placeTag, item.detail].filter(Boolean).join(' · ');
  return (
    <li
      className={styles.slide}
      data-testid="attention-row"
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}`}
    >
      <Card className={styles.slideCard}>
        <div className={styles.slideHead}>
          <span className={styles.icon} aria-hidden>
            <Icon name={ICON[item.kind]} weight={lead ? 'fill' : 'regular'} size="md" />
          </span>
          <Chip item={item} now={now} zone={zone} />
        </div>
        <Link href={item.href} className={styles.titleLink}>
          {item.label}
        </Link>
        {meta ? <span className={styles.detail}>{meta}</span> : null}
        <div className={styles.actions}>
          <Actions item={item} primary={lead} onResolved={onResolved} />
        </div>
      </Card>
    </li>
  );
}

/**
 * "Needs your attention", Direction B, tightened: every item is the same size (the most urgent just carries the lime action and a label);
 * one condensed card per item in a swiper that bleeds to the screen edge. One merged list for dual roles, each card with a place tag. States: loading
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
  const all = [...shown, ...more];
  const total = all.length;

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
          <ul
            className={styles.swiper}
            aria-label="Needs your attention"
            aria-roledescription="carousel"
            tabIndex={0}
          >
            {all.map((i, n) => (
              <Slide
                key={i.key}
                item={i}
                now={now}
                zone={zone}
                lead={n === 0}
                index={n}
                total={all.length}
                onResolved={settle}
              />
            ))}
          </ul>
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
    </section>
  );
}
