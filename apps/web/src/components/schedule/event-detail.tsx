'use client';

import {
  EVENT_TYPE_LABELS,
  describeEventTime,
  queryRangeForDays,
  localDateKey,
  mapEmbedUrl,
  type RsvpStatus,
} from '@athleit/core';
import {
  getEvent,
  getHouseholdScheduleRange,
  getRsvpDetail,
  getRsvpSummary,
  type EventDetail as EventDetailRow,
  type RsvpDetailRow,
  type RsvpSummary,
} from '@athleit/db/scheduling';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingSkeleton,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { CancelSheet } from './cancel-sheet';
import { EventForm } from './event-form';
import { RsvpControls, type ChildRsvp } from './rsvp-controls';
import { ResultSheet } from './result-sheet';
import styles from './schedule.module.css';
import { useViewerZone } from './use-viewer-zone';

interface Loaded {
  event: EventDetailRow;
  summary: RsvpSummary | null;
  detail: RsvpDetailRow[] | null;
  children: ChildRsvp[];
}

async function loadAll(eventId: string): Promise<Loaded | 'missing' | 'error'> {
  const client = getClient();
  const ev = await getEvent(client, eventId);
  if (ev.error) return 'error';
  if (!ev.data) return 'missing';
  const event = ev.data;
  const [summary, detail, mine] = await Promise.all([
    getRsvpSummary(client, eventId),
    event.is_staff ? getRsvpDetail(client, eventId) : Promise.resolve(null),
    event.is_staff
      ? Promise.resolve(null)
      : getHouseholdScheduleRange(
          client,
          queryRangeForDays(
            localDateKey(event.starts_at, event.timezone),
            localDateKey(event.starts_at, event.timezone),
          ).from,
          queryRangeForDays(
            localDateKey(event.starts_at, event.timezone),
            localDateKey(event.starts_at, event.timezone),
          ).to,
        ),
  ]);
  const children: ChildRsvp[] = (mine?.data ?? [])
    .filter((r) => r.event_id === eventId)
    .map((r) => ({
      player_id: r.player_id,
      first_name: r.player_first_name,
      status: (r.rsvp_status as RsvpStatus | null) ?? null,
    }));
  return { event, summary: summary.data ?? null, detail: detail?.data ?? null, children };
}

const STATUS_ICON = {
  going: { name: 'check-circle', cls: styles.ok, label: 'Going' },
  not_going: { name: 'x-circle', cls: styles.bad, label: 'Can’t go' },
  maybe: { name: 'question', cls: styles.muted, label: 'Maybe' },
} as const;

/**
 * One event: kicker, title, date line, RSVP counts, and either the per-player list (staff) or
 * the RSVP buttons for the viewer's own children. Live: counts follow Realtime changes.
 */
export function EventDetail({
  eventId,
  variant,
  onClose,
  onChanged,
}: {
  eventId: string;
  variant: 'drawer' | 'page';
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<Loaded | 'loading' | 'missing' | 'error'>('loading');
  const [updated, setUpdated] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'cancel' | 'result' | null>(null);
  const revision = useRef<number | null>(null);
  const toast = useToast();

  const reload = useCallback(
    async (quiet = true) => {
      if (!quiet) setState('loading');
      const next = await loadAll(eventId);
      if (typeof next !== 'string') {
        if (revision.current !== null && next.event.revision !== revision.current) setUpdated(true);
        revision.current = next.event.revision;
      }
      setState(next);
    },
    [eventId],
  );

  // First load (the parent keys this component by event id, so state starts fresh per event).
  useEffect(() => {
    let live = true;
    void loadAll(eventId).then((next) => {
      if (!live) return;
      if (typeof next !== 'string') revision.current = next.event.revision;
      setState(next);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  // Realtime (RLS applies): staff see RSVP changes for their team live; everyone sees the event change.
  useEffect(() => {
    const client = getClient();
    const channel = client
      .channel(`event:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rsvps', filter: `event_id=eq.${eventId}` },
        () => void reload(true),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        () => void reload(true),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [eventId, reload]);

  const changed = () => {
    void reload(true);
    onChanged?.();
  };

  if (state === 'loading') return <LoadingSkeleton />;
  if (state === 'error')
    return <ErrorState message="We couldn’t load this event." onRetry={() => void reload(false)} />;
  if (state === 'missing')
    return (
      <EmptyState
        icon="calendar-blank"
        title="Event not found"
        body="It may have been deleted, or you may not have access."
      />
    );

  const { event, summary, detail, children } = state;
  return (
    <>
      <EventDetailView
        event={event}
        summary={summary}
        detail={detail}
        kids={children}
        variant={variant}
        updated={updated}
        onClose={onClose}
        onChanged={changed}
        actions={{
          onEdit: () => setSheet('edit'),
          onCancel: () => setSheet('cancel'),
          onResult: () => setSheet('result'),
        }}
      />
      {event.is_staff ? (
        <>
          <EventForm
            open={sheet === 'edit'}
            onClose={() => setSheet(null)}
            teamId={event.team_id}
            sport={event.sport}
            editing={event}
            onSaved={(msg) => {
              toast(msg);
              changed();
            }}
          />
          <CancelSheet
            open={sheet === 'cancel'}
            onClose={() => setSheet(null)}
            event={event}
            onDone={() => {
              toast('Event cancelled');
              changed();
            }}
          />
          <ResultSheet
            open={sheet === 'result'}
            onClose={() => setSheet(null)}
            event={event}
            onDone={changed}
          />
        </>
      ) : null}
    </>
  );
}

export function EventDetailView({
  event,
  summary,
  detail,
  kids,
  variant,
  updated,
  onClose,
  onChanged,
  actions,
}: {
  event: EventDetailRow;
  summary: RsvpSummary | null;
  detail: RsvpDetailRow[] | null;
  kids: ChildRsvp[];
  variant: 'drawer' | 'page';
  updated?: boolean;
  onClose?: (() => void) | undefined;
  onChanged?: (() => void) | undefined;
  actions?: { onEdit: () => void; onCancel: () => void; onResult: () => void } | undefined;
}) {
  const viewerZone = useViewerZone();
  const t = describeEventTime(event.starts_at, event.ends_at, event.timezone, viewerZone);
  const cancelled = event.status === 'cancelled';
  const isGame = event.type === 'game';
  const embedSrc = mapEmbedUrl({
    lat: event.location_lat,
    lng: event.location_lng,
    address: event.location_address,
    name: event.location_name ?? event.location_text,
  });
  const ended = new Date(event.ends_at) < new Date();
  const started = new Date(event.starts_at) <= new Date();
  const counts = summary
    ? [
        { v: summary.going, l: 'Going' },
        { v: summary.not_going, l: 'Can’t go' },
        { v: summary.no_reply, l: 'No reply' },
      ]
    : [];

  return (
    <>
      <div className={styles.drawerHead}>
        <span className={styles.kicker}>{EVENT_TYPE_LABELS[event.type as 'game']}</span>
        {variant === 'drawer' && onClose ? (
          <IconButton icon="x" label="Close event" onClick={onClose} />
        ) : null}
      </div>
      <div>
        <h2 className={styles.detailTitle} data-testid="event-title">
          {event.title}
        </h2>
      </div>
      {embedSrc ? (
        <iframe
          className={styles.map}
          title={`Map: ${event.location_name ?? event.location_text ?? 'event location'}`}
          loading="lazy"
          src={embedSrc}
          data-testid="event-map"
        />
      ) : null}

      {cancelled ? (
        <p className={styles.banner} role="status" data-testid="cancelled-banner">
          Cancelled{event.cancelled_reason ? `: ${event.cancelled_reason}` : ''}
        </p>
      ) : null}
      {updated && !cancelled ? (
        <p className={styles.updated} role="status" data-testid="updated-banner">
          Updated: the time or place changed. Check the details below.
        </p>
      ) : null}

      <ul className={styles.facts}>
        <li className={styles.fact}>
          <Icon name="calendar-blank" />
          <span>
            {t.dateLabel} · {t.rangeLabel} {t.zoneLabel}
            {t.viewerLocalLabel ? (
              <span className={styles.detailMeta}> (your time: {t.viewerLocalLabel})</span>
            ) : null}
          </span>
        </li>
        {event.location_name || event.location_text ? (
          <li className={styles.fact}>
            <Icon name="map-pin" />
            <span>{event.location_name ?? event.location_text}</span>
          </li>
        ) : null}
        {event.virtual_url ? (
          <li className={styles.fact}>
            <Icon name="link" />
            <span>
              Virtual ·{' '}
              <a href={event.virtual_url} target="_blank" rel="noreferrer noopener">
                Join meeting
              </a>
            </span>
          </li>
        ) : null}
        {isGame && event.opponent_name ? (
          <li className={styles.fact}>
            <Icon name="flag" /> vs. {event.opponent_name}
            {event.home_away ? ` (${event.home_away})` : ''}
          </li>
        ) : null}
        {event.arrive_early_minutes ? (
          <li className={styles.fact}>
            <Icon name="clock" /> Arrive {event.arrive_early_minutes} min early
          </li>
        ) : null}
      </ul>
      {event.notes ? (
        <div className={styles.note} data-testid="event-notes">
          {event.notes}
        </div>
      ) : null}

      {isGame && event.outcome ? (
        <p className={styles.detailTitle} data-testid="result-line">
          {event.outcome === 'win' ? 'Won' : event.outcome === 'loss' ? 'Lost' : 'Tied'}{' '}
          {event.our_score}–{event.their_score}
        </p>
      ) : null}

      {!cancelled && counts.length > 0 ? (
        <div
          className={styles.counts}
          role="group"
          aria-label="RSVP counts"
          data-testid="rsvp-counts"
        >
          {counts.map((c) => (
            <div key={c.l} className={styles.count}>
              <span className={styles.countValue} aria-label={`${c.v} ${c.l}`}>
                {c.v}
              </span>
              <span className={styles.countLabel}>{c.l}</span>
            </div>
          ))}
        </div>
      ) : null}

      {event.is_staff && detail && !cancelled ? (
        <ul className={styles.rsvpList} aria-label="Player RSVPs" data-testid="rsvp-list">
          {detail.map((p) => {
            const s = p.status ? STATUS_ICON[p.status as keyof typeof STATUS_ICON] : null;
            return (
              <li key={p.player_id} className={styles.rsvpRow} data-testid="rsvp-row">
                <span className={styles.rsvpName}>
                  {p.first_name} {p.last_name}
                  {p.note ? <span className={styles.rsvpNote}>{p.note}</span> : null}
                </span>
                <span className={s ? s.cls : styles.muted} aria-label={s ? s.label : 'No reply'}>
                  <Icon name={s ? s.name : 'clock'} weight="fill" size="lg" />
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className={styles.actions}>
        {!event.is_staff && !cancelled && !ended
          ? kids.map((c) => (
              <RsvpControls
                key={c.player_id}
                eventId={event.id}
                child={c}
                showName={kids.length > 1}
                onChanged={onChanged}
              />
            ))
          : null}
        {event.is_staff && !cancelled ? (
          <>
            <div className={styles.actionRow}>
              {isGame && started ? (
                <Button fullWidth onClick={() => actions?.onResult()} data-testid="enter-result">
                  {event.outcome ? 'Edit result' : 'Enter result'}
                </Button>
              ) : null}
              <Button
                fullWidth
                variant="secondary"
                onClick={() => actions?.onEdit()}
                data-testid="edit-event"
              >
                <Icon name="pencil" size="sm" /> Edit
              </Button>
            </div>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => actions?.onCancel()}
              data-testid="cancel-event"
            >
              Cancel event
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}
