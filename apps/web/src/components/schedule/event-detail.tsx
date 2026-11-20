'use client';

import {
  EVENT_TYPE_LABELS,
  arriveEarlyLabel,
  describeEventTime,
  eventStateView,
  friendlyError,
  queryRangeForDays,
  localDateKey,
  mapEmbedUrl,
  mapsUrl,
  revisionNotice,
  shouldShowRevisionNotice,
  type LastChange,
  type RsvpStatus,
} from '@athleit/core';
import {
  deleteEvent,
  getEvent,
  getHouseholdScheduleRange,
  getRsvpDetail,
  getRsvpSummary,
  markEventSeen,
  type EventDetail as EventDetailRow,
  type RsvpDetailRow,
  type RsvpSummary,
} from '@athleit/db/scheduling';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingSkeleton,
  Mono,
  Text,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import { CancelSheet } from './cancel-sheet';
import { CountsBar } from './counts-bar';
import { EventForm } from './event-form';
import { RsvpControls, type ChildRsvp } from './rsvp-controls';
import { ResultSheet } from './result-sheet';
import { StaffRsvpPanel } from './staff-rsvp-panel';
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
  // The seen revision this view opened with: the revision notice holds while the event stays open.
  const [seenAtOpen, setSeenAtOpen] = useState<number | null | undefined>(undefined);
  const [sheet, setSheet] = useState<'edit' | 'cancel' | 'result' | null>(null);
  const revision = useRef<number | null>(null);
  const changedRef = useRef(onChanged);
  useEffect(() => {
    changedRef.current = onChanged;
  });
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
      if (typeof next !== 'string') {
        revision.current = next.event.revision;
        setSeenAtOpen(next.event.seen_revision);
        // Opening the event marks this revision as seen (clears the Updated chip on the lists).
        void markEventSeen(getClient(), eventId).then(() => changedRef.current?.());
      }
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
        seenAtOpen={seenAtOpen ?? null}
        onClose={onClose}
        onChanged={changed}
        actions={{
          onDelete: async () => {
            const res = await deleteEvent(getClient(), event.id);
            if (res.error) return friendlyError(res.error);
            toast('Event deleted');
            onChanged?.();
            onClose?.();
            return null;
          },
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
  seenAtOpen,
  now: nowProp,
  onClose,
  onChanged,
  actions,
}: {
  event: EventDetailRow;
  summary: RsvpSummary | null;
  detail: RsvpDetailRow[] | null;
  kids: ChildRsvp[];
  variant: 'drawer' | 'page';
  /** The event changed while this view was open (Realtime). */
  updated?: boolean;
  /** The revision this viewer had seen when the view opened (null: never). */
  seenAtOpen?: number | null;
  now?: Date;
  onClose?: (() => void) | undefined;
  onChanged?: (() => void) | undefined;
  actions?:
    | {
        onEdit: () => void;
        onCancel: () => void;
        onResult: () => void;
        /** Resolves to an error message, or null when deleted. */
        onDelete?: () => Promise<string | null>;
      }
    | undefined;
}) {
  const viewerZone = useViewerZone();
  const [clock, setClock] = useState(() => nowProp ?? new Date());
  useEffect(() => {
    if (nowProp) return;
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(t);
  }, [nowProp]);
  const now = nowProp ?? clock;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const t = describeEventTime(event.starts_at, event.ends_at, event.timezone, viewerZone);
  const cancelled = event.status === 'cancelled';
  const isGame = event.type === 'game';
  const place = event.location_name ?? event.location_text;
  const embedSrc = mapEmbedUrl({
    lat: event.location_lat,
    lng: event.location_lng,
    address: event.location_address,
    name: place,
  });
  const openInMaps = mapsUrl({
    lat: event.location_lat,
    lng: event.location_lng,
    address: event.location_address,
    name: place,
    placeId: event.location_place_id,
  });
  const ended = new Date(event.ends_at) < now;
  const started = new Date(event.starts_at) <= now;
  const state = eventStateView(event, now, viewerZone ?? event.timezone);
  const notice =
    !cancelled &&
    (updated ||
      shouldShowRevisionNotice(
        { revision: event.revision, seen_revision: seenAtOpen ?? null, starts_at: event.starts_at },
        now,
      ))
      ? revisionNotice(event.last_change as LastChange | null, {
          revision: event.revision,
          starts_at: event.starts_at,
          timezone: event.timezone,
          place: place ?? null,
        })
      : null;
  const hasReplies = summary ? summary.going + summary.not_going + summary.maybe > 0 : false;
  const deleteBlocked = hasReplies || event.outcome != null;

  return (
    <>
      <div className={styles.drawerHead}>
        <span className={styles.kicker}>{EVENT_TYPE_LABELS[event.type as 'game']}</span>
        {variant === 'drawer' && onClose ? (
          <IconButton icon="x" label="Close event" onClick={onClose} />
        ) : null}
      </div>
      <div className={styles.titleBlock}>
        <h2 className={`${styles.detailTitle} ${cancelled ? styles.struck : ''}`} data-testid="event-title">
          {event.title}
        </h2>
        <p className={styles.stateLine} role="status" aria-label={state.spoken} data-testid="event-state">
          {state.tone === 'now' ? (
            <span className={styles.livePill}>
              <span className={styles.liveDot} aria-hidden /> {state.label}
            </span>
          ) : (
            <Mono>{state.label}</Mono>
          )}
          {event.series_id ? (
            <span className={styles.detailMeta}>
              <Icon name="repeat" size="sm" /> Part of a series
            </span>
          ) : null}
        </p>
      </div>

      {cancelled ? (
        <p className={styles.banner} role="status" data-testid="cancelled-banner">
          <Icon name="x-circle" size="sm" /> Cancelled{event.cancelled_reason ? `: ${event.cancelled_reason}` : ''}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.updated} role="status" data-testid="updated-banner">
          Updated: {notice}.
        </p>
      ) : null}

      {embedSrc ? (
        <div className={styles.mapWrap}>
          <iframe
            className={styles.map}
            title={`Map: ${place ?? 'event location'}`}
            loading="lazy"
            src={embedSrc}
            data-testid="event-map"
          />
          {openInMaps ? (
            <a className={styles.mapLink} href={openInMaps} target="_blank" rel="noreferrer noopener">
              <Icon name="arrow-square-out" size="sm" /> Open in Maps
            </a>
          ) : null}
        </div>
      ) : openInMaps ? (
        <a className={styles.mapLink} href={openInMaps} target="_blank" rel="noreferrer noopener">
          <Icon name="magnifying-glass" size="sm" /> Search in Maps
        </a>
      ) : null}

      <ul className={styles.facts}>
        <li className={styles.fact}>
          <Icon name="calendar-blank" />
          <span>
            {t.dateLabel} · <span className={styles.monoText}>{t.rangeLabel}</span> {t.zoneLabel}
            {t.viewerLocalLabel ? (
              <span className={styles.detailMeta}> (your time: {t.viewerLocalLabel})</span>
            ) : null}
          </span>
        </li>
        {place ? (
          <li className={styles.fact}>
            <Icon name="map-pin" />
            <span>{place}</span>
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
            <Icon name="clock" /> {arriveEarlyLabel(event.starts_at, event.arrive_early_minutes, event.timezone)}
          </li>
        ) : null}
      </ul>
      {event.notes ? (
        <div className={styles.note} data-testid="event-notes">
          {event.notes}
        </div>
      ) : null}

      {isGame && event.outcome ? (
        <div data-testid="result-line">
          <p className={styles.detailTitle}>
            {event.outcome === 'win' ? 'Won' : event.outcome === 'loss' ? 'Lost' : 'Tied'}{' '}
            <Mono>
              {event.our_score}–{event.their_score}
            </Mono>
          </p>
          {Array.isArray(event.period_scores) && event.period_scores.length > 0 ? (
            <p className={styles.detailMeta}>
              <Mono>
                {(event.period_scores as { us: number; them: number }[])
                  .map((p) => `${p.us}–${p.them}`)
                  .join('  ')}
              </Mono>
            </p>
          ) : null}
        </div>
      ) : null}

      {!cancelled && summary ? <CountsBar counts={summary} /> : null}

      {!event.is_staff && kids.length > 0 ? (
        cancelled || ended ? (
          <p className={styles.meta} data-testid="replies-closed">
            {cancelled ? 'This event was cancelled, so replies are closed.' : 'This event is over, so replies are closed.'}
          </p>
        ) : (
          <div className={styles.actions}>
            {kids.map((c) => (
              <RsvpControls
                key={c.player_id}
                eventId={event.id}
                child={c}
                showName={kids.length > 1}
                onChanged={onChanged}
              />
            ))}
          </div>
        )
      ) : null}

      {event.is_staff && detail && !cancelled ? (
        <StaffRsvpPanel
          event={event}
          summary={summary}
          detail={detail}
          onChanged={() => onChanged?.()}
        />
      ) : null}

      {event.is_staff ? (
        <div className={styles.actions}>
          {!cancelled ? (
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
              <Button fullWidth variant="ghost" onClick={() => actions?.onCancel()} data-testid="cancel-event">
                Cancel event
              </Button>
            </>
          ) : null}
          {actions?.onDelete ? (
            <>
              <Button
                fullWidth
                variant="ghost"
                disabled={deleteBlocked}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(true);
                }}
                data-testid="delete-event"
              >
                <Icon name="trash" size="sm" /> Delete event
              </Button>
              {deleteBlocked ? (
                <p className={styles.meta} data-testid="delete-blocked">
                  {event.outcome != null ? 'A result is recorded' : 'Families have replied'}, so this can’t be deleted.
                  {cancelled ? '' : ' Cancel instead.'}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {actions?.onDelete ? (
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete this event?"
          confirmLabel="Delete event"
          alert
          onConfirm={async () => {
            const err = await actions.onDelete!();
            if (err) setDeleteError(err);
            else setConfirmDelete(false);
          }}
        >
          <Text muted as="p">
            It is removed from the schedule and nobody is notified. This can’t be undone.
          </Text>
          {deleteError ? (
            <p className={styles.banner} role="alert">
              {deleteError}
            </p>
          ) : null}
        </ConfirmSheet>
      ) : null}
    </>
  );
}
