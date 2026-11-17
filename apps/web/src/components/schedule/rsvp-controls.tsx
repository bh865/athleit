'use client';

import { RSVP_LABELS, friendlyError, type RsvpStatus } from '@athleit/core';
import { setRsvp } from '@athleit/db/scheduling';
import { useState } from 'react';

import { Button, Icon } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './schedule.module.css';

export interface ChildRsvp {
  player_id: string;
  first_name: string;
  status: RsvpStatus | null;
}

/**
 * Going / Can't go (and a quiet Maybe) for ONE child. Optimistic: the choice shows at once and
 * reverts with a Retry if the database refuses it. The status is announced to screen readers.
 */
export function RsvpControls({
  eventId,
  child,
  showName,
  disabled,
  onChanged,
}: {
  eventId: string;
  child: ChildRsvp;
  showName: boolean;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const [status, setStatus] = useState<RsvpStatus | null>(child.status);
  const [error, setError] = useState<{ message: string; next: RsvpStatus } | null>(null);
  const [pending, setPending] = useState(false);
  // Follow the server value when it changes underneath us (e.g. a refresh).
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

  const current = status ? RSVP_LABELS[status] : 'No reply yet';
  return (
    <div className={styles.child} data-testid="rsvp-controls" data-player={child.first_name}>
      {showName ? <span className={styles.childName}>{child.first_name}</span> : null}
      <div className={styles.pair} role="group" aria-label={`RSVP for ${child.first_name}`}>
        <Button
          size="lg"
          variant={status === 'going' ? 'primary' : 'secondary'}
          aria-pressed={status === 'going'}
          disabled={disabled || pending}
          onClick={() => choose('going')}
        >
          <Icon name="check-circle" weight={status === 'going' ? 'fill' : 'regular'} /> Going
        </Button>
        <Button
          size="lg"
          variant={status === 'not_going' ? 'primary' : 'secondary'}
          aria-pressed={status === 'not_going'}
          disabled={disabled || pending}
          onClick={() => choose('not_going')}
        >
          Can’t go
        </Button>
      </div>
      <Button
        variant="ghost"
        aria-pressed={status === 'maybe'}
        disabled={disabled || pending}
        onClick={() => choose('maybe')}
      >
        {status === 'maybe' ? 'Maybe (selected)' : 'Maybe'}
      </Button>
      <span className={styles.meta} role="status" aria-live="polite">
        {child.first_name}: {current}
      </span>
      {error ? (
        <p className={styles.banner} role="alert">
          {error.message}{' '}
          <Button variant="secondary" onClick={() => choose(error.next)}>
            Retry
          </Button>
        </p>
      ) : null}
    </div>
  );
}
