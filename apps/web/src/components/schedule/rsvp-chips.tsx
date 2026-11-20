'use client';

import { RSVP_LABELS, friendlyError, rsvpChipLabel, type RsvpStatus } from '@athleit/core';
import { setRsvp } from '@athleit/db/scheduling';
import { useState } from 'react';

import { Button, Icon } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import type { ScheduleItem } from './items';
import styles from './schedule.module.css';

type Child = NonNullable<ScheduleItem['children']>[number];

const STATUS_ICON = {
  going: 'check-circle',
  not_going: 'x-circle',
  maybe: 'question',
} as const;

/**
 * One child on a row: the "Maya: Going" chip (icon and words, never colour alone) and, while the event is still
 * open, Going and Can't go quick actions. Calls the same set_rsvp as the detail; optimistic, with Retry.
 */
export function RsvpChipRow({
  eventId,
  child,
  quickActions,
  onChanged,
}: {
  eventId: string;
  child: Child;
  quickActions: boolean;
  onChanged?: () => void;
}) {
  const [status, setStatus] = useState<RsvpStatus | null>(child.status);
  const [error, setError] = useState<{ message: string; next: RsvpStatus } | null>(null);
  const [pending, setPending] = useState(false);
  const [seen, setSeen] = useState(child.status);
  if (seen !== child.status) {
    setSeen(child.status);
    setStatus(child.status);
  }

  async function choose(next: RsvpStatus) {
    const previous = status;
    setStatus(next);
    setError(null);
    setPending(true);
    const res = await setRsvp(getClient(), eventId, child.player_id, next);
    setPending(false);
    if (res.error) {
      setStatus(previous);
      setError({ message: friendlyError(res.error), next });
    } else onChanged?.();
  }

  return (
    <div className={styles.chipRow} data-testid="rsvp-controls" data-player={child.first_name}>
      <span className={`${styles.rsvpChip} ${status ? '' : styles.rsvpChipEmpty}`}>
        <Icon name={status ? STATUS_ICON[status] : 'circle-dashed'} weight={status ? 'fill' : 'regular'} size="sm" />
        <span>
          {child.first_name}: {status ? RSVP_LABELS[status] : 'No reply'}
        </span>
      </span>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {rsvpChipLabel(child.first_name, status)}
      </span>
      {quickActions ? (
        <span className={styles.quick} role="group" aria-label={`RSVP for ${child.first_name}`}>
          <Button
            variant={status === 'going' ? 'primary' : 'secondary'}
            aria-pressed={status === 'going'}
            aria-label={`${child.first_name}: Going`}
            disabled={pending}
            onClick={() => choose('going')}
          >
            Going
          </Button>
          <Button
            variant={status === 'not_going' ? 'primary' : 'secondary'}
            aria-pressed={status === 'not_going'}
            aria-label={`${child.first_name}: Can’t go`}
            disabled={pending}
            onClick={() => choose('not_going')}
          >
            Can’t go
          </Button>
        </span>
      ) : null}
      {error ? (
        <span className={styles.rowError} role="alert">
          {error.message}{' '}
          <Button variant="secondary" onClick={() => choose(error.next)}>
            Retry
          </Button>
        </span>
      ) : null}
    </div>
  );
}
