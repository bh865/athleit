'use client';

import { calendarFeedUrl, friendlyError } from '@athleit/core';
import {
  createFeedToken,
  getFeedTokenStatus,
  revokeFeedToken,
  rotateFeedToken,
} from '@athleit/db/scheduling';
import { useState } from 'react';

import { FormMessage, LoadState } from '@/components/app/states';
import { Button, Icon, Sheet, Text, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './schedule.module.css';

/**
 * Calendar feed settings: create, copy, reset (rotate) and turn off a private subscription link.
 * The link is shown once; only a hash is stored, so a lost link is reset, never recovered.
 */
export function CalendarFeed({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useLoad(
    () => (open ? getFeedTokenStatus(getClient()) : Promise.resolve({ data: [], error: null })),
    [open],
  );
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const active = (status.data ?? []).length > 0;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  async function act(kind: 'create' | 'rotate' | 'revoke') {
    setBusy(true);
    setError(null);
    const client = getClient();
    if (kind === 'revoke') {
      const r = await revokeFeedToken(client);
      setBusy(false);
      if (r.error) return setError(friendlyError(r.error));
      setUrl(null);
      status.reload();
      return toast('Calendar link turned off');
    }
    const r = kind === 'create' ? await createFeedToken(client) : await rotateFeedToken(client);
    setBusy(false);
    if (r.error) return setError(friendlyError(r.error));
    setUrl(calendarFeedUrl(base, r.data));
    status.reload();
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setUrl(null);
        onClose();
      }}
      title="Calendar link"
      placement="right"
    >
      <div className={styles.form}>
        <Text variant="heading" as="h2">
          Calendar link
        </Text>
        <Text muted as="p">
          Subscribe in Apple Calendar or Google Calendar to see every team’s schedule there. Anyone
          with the link can see it, so keep it private.
        </Text>
        <LoadState loading={status.loading && !url} error={status.error} onRetry={status.reload}>
          {url ? (
            <>
              <p className={styles.token} data-testid="feed-url">
                {url}
              </p>
              <Button
                onClick={() =>
                  void navigator.clipboard?.writeText(url).then(() => toast('Link copied'))
                }
              >
                <Icon name="copy" size="sm" /> Copy link
              </Button>
              <Text muted as="p">
                This is the only time the link is shown. Copy it now.
              </Text>
            </>
          ) : active ? (
            <Text as="p">
              A calendar link is on. To get a new link, reset it; the old one stops working.
            </Text>
          ) : (
            <Button onClick={() => void act('create')} loading={busy} data-testid="create-feed">
              Create calendar link
            </Button>
          )}
        </LoadState>
        {active || url ? (
          <div className={styles.actionRow}>
            <Button variant="secondary" onClick={() => void act('rotate')} loading={busy}>
              <Icon name="arrow-clockwise" size="sm" /> Reset link
            </Button>
            <Button variant="ghost" onClick={() => void act('revoke')} disabled={busy}>
              Turn off
            </Button>
          </div>
        ) : null}
        <FormMessage error={error} />
      </div>
    </Sheet>
  );
}
