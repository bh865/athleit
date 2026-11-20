'use client';
import { getMySupportRequests, type MyRequestRow, type RequesterStatus } from '@athleit/db/support';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Chip, EmptyState, ErrorState, Heading, LoadingSkeleton } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

import styles from './help.module.css';
import { StatusChip } from './thread';

const FILTERS: { value: RequesterStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_requester', label: 'Waiting on you' },
  { value: 'solved', label: 'Solved' },
  { value: 'closed', label: 'Closed' },
];
const TYPE_LABEL = {
  question: 'Question',
  problem: 'Something’s wrong',
  billing: 'Billing',
  feedback: 'Idea',
} as const;

export function RequestList() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<RequesterStatus | null>(null);
  const [rows, setRows] = useState<MyRequestRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    void getMySupportRequests(supabase, { status }).then((r) => {
      if (!live) return;
      if (r.error) return setError(true);
      setError(false);
      setRows(r.data.items);
    });
    return () => {
      live = false;
    };
  }, [supabase, status]);

  return (
    <>
      <Heading level="title">Your requests</Heading>
      <div className={styles.chips} role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip
            key={f.label}
            selected={status === f.value}
            onClick={() => {
              setRows(null);
              setStatus(f.value);
            }}
          >
            {f.label}
          </Chip>
        ))}
      </div>
      {error ? (
        <ErrorState message="We couldn’t load your requests. Refresh to try again." />
      ) : rows === null ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="You haven’t contacted us yet"
          body="When you send a request it will show up here."
        />
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.ref}>
              <Link className={styles.item} href={`/help/requests/${r.ref}`}>
                <span>
                  {r.unread ? <span aria-label="Unread reply">● </span> : null}
                  <strong>{r.subject}</strong>
                </span>
                <span className={styles.mono}>
                  {r.ref} · {TYPE_LABEL[r.type]} · <StatusChip status={r.status} /> ·{' '}
                  {new Date(r.last_activity_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className={styles.link} href="/help/contact">
        Contact support
      </Link>
    </>
  );
}
