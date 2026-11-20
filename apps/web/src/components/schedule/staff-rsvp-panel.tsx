'use client';

import { RSVP_LABELS, friendlyError, nudgeResultText, nudgeState, type RsvpStatus } from '@athleit/core';
import {
  nudgeRsvpNonResponders,
  staffSetRsvp,
  type EventDetail as EventDetailRow,
  type RsvpDetailRow,
  type RsvpSummary,
} from '@athleit/db/scheduling';
import { useMemo, useState } from 'react';

import { Button, Chip, ConfirmSheet, Icon, TextField, Text, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './schedule.module.css';

type Filter = 'all' | RsvpStatus | 'no_reply';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'going', label: 'Going' },
  { key: 'not_going', label: 'Can’t go' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'no_reply', label: 'No reply' },
];
const STATUS_ICON = { going: 'check-circle', not_going: 'x-circle', maybe: 'question' } as const;

/**
 * Staff only. Every active player with their status in words and an icon, their note, a filter and a search,
 * "Set RSVP" on a player's behalf (marked "Set by staff"), and Nudge for families who have not replied.
 * Names appear nowhere else on the Schedule.
 */
export function StaffRsvpPanel({
  event,
  summary,
  detail,
  onChanged,
}: {
  event: EventDetailRow;
  summary: RsvpSummary | null;
  detail: RsvpDetailRow[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [nudging, setNudging] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return detail.filter((p) => {
      if (filter === 'no_reply' ? p.status != null : filter !== 'all' && p.status !== filter) return false;
      return !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
    });
  }, [detail, filter, query]);

  const nudge = nudgeState(
    { status: event.status as 'scheduled' | 'cancelled', ends_at: event.ends_at, no_reply: summary?.no_reply ?? 0 },
    new Date(),
  );

  async function setFor(playerId: string, status: RsvpStatus) {
    setBusy(playerId);
    setError(null);
    const res = await staffSetRsvp(getClient(), event.id, playerId, status);
    setBusy(null);
    if (res.error) setError(friendlyError(res.error));
    else {
      setEditing(null);
      onChanged();
    }
  }

  async function sendNudge() {
    setNudging(true);
    const res = await nudgeRsvpNonResponders(getClient(), event.id);
    setNudging(false);
    setConfirm(false);
    if (res.error) setError(friendlyError(res.error));
    else {
      setError(null);
      toast(nudgeResultText(res.data));
    }
  }

  return (
    <section className={styles.staffPanel} aria-label="Player replies">
      <div className={styles.staffHead}>
        <Text variant="heading" as="h3">
          Replies
        </Text>
        <Button
          variant="secondary"
          disabled={!nudge.canNudge}
          onClick={() => setConfirm(true)}
          data-testid="nudge"
        >
          <Icon name="bell-ringing" size="sm" /> Nudge
        </Button>
      </div>
      {!nudge.canNudge ? (
        <p className={styles.meta} data-testid="nudge-reason">
          {nudge.reason}
        </p>
      ) : null}

      <div className={styles.filterRow} role="group" aria-label="Filter players by reply">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <TextField label="Search players" value={query} onChange={(e) => setQuery(e.target.value)} />
      {error ? (
        <p className={styles.banner} role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className={styles.meta}>No players match.</p>
      ) : (
        <ul className={styles.rsvpList} aria-label="Player RSVPs" data-testid="rsvp-list">
          {rows.map((p) => {
            const status = p.status as RsvpStatus | null;
            const open = editing === p.player_id;
            return (
              <li key={p.player_id} className={styles.rsvpItem} data-testid="rsvp-row">
                <div className={styles.rsvpRow}>
                  <span className={styles.rsvpName}>
                    {p.first_name} {p.last_name}
                    {p.note ? <span className={styles.rsvpNote}>{p.note}</span> : null}
                    {p.set_by_staff && status ? (
                      <span className={styles.rsvpNote}>Set by staff{p.responded_by_name ? ` (${p.responded_by_name})` : ''}</span>
                    ) : null}
                  </span>
                  <span className={`${styles.statusText} ${status ? '' : styles.muted}`}>
                    <Icon name={status ? STATUS_ICON[status] : 'circle-dashed'} weight={status ? 'fill' : 'regular'} />
                    {status ? RSVP_LABELS[status] : 'No reply'}
                  </span>
                  {event.status !== 'cancelled' ? (
                    <Button
                      variant="ghost"
                      aria-expanded={open}
                      aria-label={`Set RSVP for ${p.first_name} ${p.last_name}`}
                      onClick={() => setEditing(open ? null : p.player_id)}
                    >
                      Set RSVP
                    </Button>
                  ) : null}
                </div>
                {open ? (
                  <div className={styles.setRow} role="group" aria-label={`Set RSVP for ${p.first_name}`}>
                    {(['going', 'not_going', 'maybe'] as const).map((k) => (
                      <Button
                        key={k}
                        variant={status === k ? 'primary' : 'secondary'}
                        aria-pressed={status === k}
                        disabled={busy === p.player_id}
                        onClick={() => setFor(p.player_id, k)}
                      >
                        {RSVP_LABELS[k]}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remind families?"
        confirmLabel="Send reminder"
        busy={nudging}
        onConfirm={sendNudge}
      >
        <Text muted as="p">
          {nudge.canNudge ? nudge.confirm : ''} They get the usual RSVP reminder. You can nudge an event once every
          6 hours.
        </Text>
      </ConfirmSheet>
    </section>
  );
}
