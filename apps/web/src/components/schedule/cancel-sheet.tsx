'use client';

import { friendlyError, type EditScope } from '@athleit/core';
import { cancelEvent, type EventDetail } from '@athleit/db/scheduling';
import { useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { Button, Sheet, Text, TextArea } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './schedule.module.css';
import { ScopePicker } from './scope-picker';

/** Cancel flow: a reason is required; series events also pick a scope. The event stays visible, struck through. */
export function CancelSheet({
  open,
  onClose,
  event,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  event: EventDetail;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<EditScope>('this');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await cancelEvent(getClient(), event.id, event.series_id ? scope : 'this', reason);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setReason('');
    onClose();
    onDone();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Cancel event" level="modal" placement="center">
      <div className={styles.form}>
        <Text variant="heading" as="h2">
          Cancel “{event.title}”?
        </Text>
        <Text muted as="p">
          Families are told, and the event stays on the schedule marked cancelled.
        </Text>
        {event.series_id ? <ScopePicker kind="cancel" value={scope} onChange={setScope} /> : null}
        <TextArea
          label="Reason (shown to families)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
        <FormMessage error={error} />
        <div className={styles.actionRow}>
          <Button
            onClick={submit}
            loading={busy}
            disabled={reason.trim().length === 0}
            data-testid="confirm-cancel"
          >
            Cancel event
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep event
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
