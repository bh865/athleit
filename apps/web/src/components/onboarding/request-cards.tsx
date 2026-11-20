'use client';

import { friendlyError, pendingView, type MyJoinRequest } from '@athleit/core';
import { cancelJoinRequest } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { FormMessage } from '@/components/app/states';
import { Badge, Button, Card, ConfirmSheet } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './onboarding.module.css';

const TONE = {
  Pending: 'warning',
  Approved: 'success',
  Declined: 'danger',
  Cancelled: 'neutral',
} as const;

const sentOn = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * A request the person sent. It shows only what they supplied (kind, child, date, status); the team or
 * family name appears once approved. Cancel opens a confirm sheet, then the request leaves the
 * approver's list.
 */
export function RequestCard({
  request,
  onChanged,
}: {
  request: MyJoinRequest;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { contexts, setActive, refresh } = useApp();
  const v = pendingView(request);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await cancelJoinRequest(getClient(), v.kind, v.requestId);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setConfirm(false);
    onChanged();
  }

  async function open() {
    await refresh();
    const place = contexts.find((c) => c.title === v.placeName);
    if (place) setActive(place.key);
    router.replace('/');
  }

  return (
    <Card className={styles.stack} data-testid={`request-${v.status}`}>
      <div className={styles.requestHead}>
        <p className={styles.kicker}>
          {v.kind === 'household' ? 'Family request' : 'Team request'}
        </p>
        <Badge tone={TONE[v.statusWord]}>{v.statusWord}</Badge>
      </div>
      <h2 style={{ margin: 0 }}>{v.title}</h2>
      <p className={styles.muted}>
        {v.childFirstName ? `For ${v.childFirstName} · ` : ''}
        {`Sent ${sentOn(request.created_at)}`}
      </p>
      <p style={{ margin: 0 }}>{v.body}</p>
      {v.status === 'pending' ? (
        <Button variant="ghost" onClick={() => setConfirm(true)}>
          Cancel request
        </Button>
      ) : null}
      {v.status === 'approved' && v.placeName ? (
        <Button onClick={() => void open()}>{`Open ${v.placeName}`}</Button>
      ) : null}
      {v.status === 'declined' ? (
        <Button onClick={() => router.push('/onboarding/code')}>Try again</Button>
      ) : null}
      {v.status === 'cancelled' ? (
        <Button onClick={() => router.push('/onboarding/code')}>Send a new request</Button>
      ) : null}
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Cancel this request?"
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        busy={busy}
        onConfirm={() => void cancel()}
      >
        <p style={{ margin: 0 }}>
          The {v.kind === 'household' ? 'family' : 'team'} won’t see it. You can send a new one any
          time.
        </p>
        <FormMessage error={error} />
      </ConfirmSheet>
    </Card>
  );
}

/** Pending requests, plus (when the person has no place yet) the most recent one that was decided. */
export function RequestCards({
  requests,
  hasPlace,
  onChanged,
}: {
  requests: readonly MyJoinRequest[];
  hasPlace: boolean;
  onChanged: () => void;
}) {
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = hasPlace ? undefined : requests.find((r) => r.status !== 'pending');
  const shown = decided ? [...pending, decided] : pending;
  if (shown.length === 0) return null;
  return (
    <div className={styles.stack}>
      {shown.map((r) => (
        <RequestCard key={r.request_id} request={r} onChanged={onChanged} />
      ))}
    </div>
  );
}
