'use client';

import {
  eventNoun,
  hasUpdate,
  mapEmbedUrl,
  mapsUrl,
  nextUpHeadline,
  pickNextUp,
  rsvpSegments,
  type NextUpEvent,
} from '@athleit/core';
import { getNextUp, getTeamSchedule } from '@athleit/db/scheduling';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { RsvpControls } from '@/components/schedule/rsvp-controls';
import { useViewerZone } from '@/components/schedule/use-viewer-zone';
import {
  Button,
  ButtonLink,
  Card,
  ErrorState,
  Glass,
  Icon,
  LoadingSkeleton,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './next-up.module.css';

interface Child {
  player_id: string;
  first_name: string;
  status: 'going' | 'not_going' | 'maybe' | null;
}
interface View {
  event: NextUpEvent;
  place: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  homeAway: string | null;
  opponent: string | null;
  arriveEarly: number | null;
  counts: { going: number; not_going: number; maybe: number; no_reply: number } | null;
  children: Child[];
  staff: boolean;
}

/** A clock that ticks without refetching: the relative label ("in 38 min", "Live now") stays right. */
function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const seenKey = (id: string) => `athleit:event-revision:${id}`;
const readSeen = (id: string): number | null => {
  try {
    const v = window.localStorage.getItem(seenKey(id));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};
const writeSeen = (id: string, rev: number) => {
  try {
    window.localStorage.setItem(seenKey(id), String(rev));
  } catch {
    /* storage can be blocked: the banner simply does not show */
  }
};

/**
 * "Next up", the game-day card. A time-aware headline (big mono time with a live relative line, Live now, then
 * Final), a wide map with a glass place pill, per-child Going / Can't go for parents and an RSVP counts bar for
 * staff. The card follows a state machine in `@athleit/core` (before, live, final, cancelled) and shows an
 * "updated" banner when the event changed since the viewer last saw it.
 */
export function NextUpHero({ teamId, canManage }: { teamId: string | null; canManage: boolean }) {
  const zone = useViewerZone() ?? 'UTC';
  const now = useNow();
  const res = useLoad(async () => {
    const c = getClient();
    const [next, up, past] = await Promise.all([
      getNextUp(c, 6),
      teamId ? getTeamSchedule(c, teamId, 'upcoming', 4) : Promise.resolve(null),
      teamId ? getTeamSchedule(c, teamId, 'past', 3) : Promise.resolve(null),
    ]);
    if (next.error) return next;
    const views = new Map<string, View>();
    for (const r of next.data) {
      views.set(r.event_id, {
        event: {
          eventId: r.event_id,
          type: r.type,
          title: r.title,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          timezone: r.timezone,
          status: 'scheduled',
          revision: r.revision,
        },
        place: r.location_name ?? r.location_text ?? null,
        address: r.location_address ?? null,
        lat: r.location_lat ?? null,
        lng: r.location_lng ?? null,
        placeId: r.location_place_id ?? null,
        homeAway: r.home_away ?? null,
        opponent: r.opponent_name ?? null,
        arriveEarly: r.arrive_early_minutes ?? null,
        counts: { going: r.going, not_going: r.not_going, maybe: r.maybe, no_reply: r.no_reply },
        children: (r.children as unknown as Child[]) ?? [],
        staff: r.is_staff,
      });
    }
    // The team schedule adds what next_up leaves out: a cancelled event and a game that just ended.
    for (const r of [...(up?.data ?? []), ...(past?.data ?? [])]) {
      if (views.has(r.id)) continue;
      views.set(r.id, {
        event: {
          eventId: r.id,
          type: r.type,
          title: r.title,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          timezone: r.timezone,
          status: r.status,
          cancelledReason: r.cancelled_reason,
          ourScore: r.our_score,
          theirScore: r.their_score,
          revision: r.revision,
        },
        place: r.location_name ?? r.location_text ?? null,
        address: r.location_address ?? null,
        lat: r.location_lat ?? null,
        lng: r.location_lng ?? null,
        placeId: r.location_place_id ?? null,
        homeAway: r.home_away ?? null,
        opponent: r.opponent_name ?? null,
        arriveEarly: r.arrive_early_minutes ?? null,
        counts: { going: r.going, not_going: r.not_going, maybe: r.maybe, no_reply: r.no_reply },
        children: [],
        staff: canManage,
      });
    }
    // A finished game from the schedule carries its score; a live next_up row does not.
    for (const r of past?.data ?? []) {
      const v = views.get(r.id);
      if (v) v.event = { ...v.event, ourScore: r.our_score, theirScore: r.their_score };
    }
    return { data: [...views.values()], error: null };
  }, [teamId, canManage]);

  const data = res.data;
  const view = useMemo(() => {
    const all = data ?? [];
    const pick = pickNextUp(
      all.map((v) => v.event),
      now,
    );
    return pick ? all.find((v) => v.event.eventId === pick.eventId) : undefined;
  }, [data, now]);

  if (res.loading && !res.data)
    return (
      <Card className={styles.empty} aria-busy data-testid="next-up">
        <LoadingSkeleton rows={3} />
      </Card>
    );
  if (res.error)
    return (
      <Card className={styles.empty} data-testid="next-up">
        <ErrorState message="Couldn’t load what’s next." onRetry={res.reload} />
      </Card>
    );
  if (!view)
    return (
      <Card className={styles.empty} data-testid="next-up" data-state="none">
        <span className={styles.kicker}>Next up</span>
        <p className={styles.muted}>Nothing is scheduled yet.</p>
        <div>
          <ButtonLink href="/schedule" variant="secondary">
            {canManage ? 'Add an event' : 'Open schedule'}
          </ButtonLink>
        </div>
      </Card>
    );
  return <NextUpCard view={view} now={now} zone={zone} />;
}

function NextUpCard({ view, now, zone }: { view: View; now: Date; zone: string }) {
  const { event: e } = view;
  const h = nextUpHeadline(e, now, zone);
  const noun = eventNoun(e.type);
  const embedSrc = mapEmbedUrl({
    lat: view.lat,
    lng: view.lng,
    address: view.address,
    name: view.place,
  });
  const openMaps = mapsUrl({
    placeId: view.placeId,
    lat: view.lat,
    lng: view.lng,
    address: view.address,
    name: view.place,
  });
  const start = new Date(e.startsAt);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(start);
  const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: zone, day: 'numeric' }).format(start);

  // The "updated" banner: the revision moved on since this viewer last looked at the event.
  // The card only renders after its data loads on the client, so reading storage here cannot mismatch hydration.
  const [seen, setSeen] = useState<number | null>(() => readSeen(e.eventId));
  useEffect(() => {
    // First sighting: remember the revision so only later changes raise the banner.
    if (seen === null && e.revision != null) writeSeen(e.eventId, e.revision);
  }, [seen, e.eventId, e.revision]);
  const updated = hasUpdate(e.revision, seen) && h.phase !== 'cancelled';

  const phase = h.phase;
  const showMap = Boolean(embedSrc) && phase !== 'final';
  return (
    <Card
      className={`${styles.card} ${showMap ? styles.withMap : ''}`}
      data-testid="next-up"
      data-state={phase}
    >
      <div className={styles.body}>
        <span className={styles.kicker}>Next up</span>
        {updated ? (
          <div className={styles.banner} role="status">
            <Icon name="info" weight="fill" size="sm" />
            <span>This {noun.toLowerCase()} was updated. Check the time and place.</span>
            <Button
              variant="ghost"
              onClick={() => {
                writeSeen(e.eventId, e.revision ?? 0);
                setSeen(e.revision ?? 0);
              }}
            >
              Got it
            </Button>
          </div>
        ) : null}
        {phase === 'cancelled' ? (
          <div className={`${styles.banner} ${styles.bad}`} role="status">
            <Icon name="x-circle" weight="fill" size="sm" />
            <span>Cancelled{e.cancelledReason ? ` · ${e.cancelledReason}` : ''}</span>
          </div>
        ) : null}
        <div className={styles.headline} role="group" aria-label={h.spoken}>
          <span className={styles.date} aria-hidden>
            <span className={styles.dow}>{day}</span>
            <span className={styles.dom}>{dayNum}</span>
          </span>
          <span className={styles.timeBlock} aria-hidden>
            <span className={`${styles.time} ${phase === 'cancelled' ? styles.struck : ''}`}>
              {h.time}
            </span>
            {phase === 'live' ? (
              <span className={styles.live}>
                <span className={styles.liveDot} /> Live now
              </span>
            ) : phase === 'final' ? (
              <span className={styles.relative}>Final{h.score ? ` ${h.score}` : ''}</span>
            ) : h.relative ? (
              <span className={styles.relative}>{h.relative}</span>
            ) : null}
          </span>
        </div>
        <Link
          href={`/events/${e.eventId}`}
          className={`${styles.title} ${phase === 'cancelled' ? styles.struck : ''}`}
        >
          {e.title}
        </Link>
        <ul className={styles.facts}>
          {view.place ? (
            <li>
              <Icon name="map-pin" size="sm" /> {view.place}
            </li>
          ) : null}
          {e.type === 'game' && view.homeAway ? (
            <li>
              <Icon name="house" size="sm" /> {view.homeAway === 'home' ? 'Home' : 'Away'}
              {view.opponent ? ` vs. ${view.opponent}` : ''}
            </li>
          ) : null}
          {view.arriveEarly && phase === 'before' ? (
            <li>
              <Icon name="clock-countdown" size="sm" /> Arrive {view.arriveEarly} min early
            </li>
          ) : null}
        </ul>
        {phase === 'final' && h.needsResult && view.staff ? (
          <div>
            <ButtonLink href={`/events/${e.eventId}`}>
              <Icon name="flag" size="sm" /> Enter result
            </ButtonLink>
          </div>
        ) : null}
        {phase !== 'cancelled' && phase !== 'final'
          ? view.children.map((c) => (
              <RsvpControls
                key={c.player_id}
                eventId={e.eventId}
                child={c}
                showName={view.children.length > 1}
                layout="row"
              />
            ))
          : null}
        {view.staff && view.counts && phase !== 'cancelled' && phase !== 'final' ? (
          <RsvpBar counts={view.counts} />
        ) : null}
      </div>
      {showMap ? (
        <div className={styles.map} data-testid="next-up-map">
          <iframe
            className={styles.frame}
            title={`Map: ${view.place ?? 'event location'}`}
            loading="lazy"
            src={embedSrc!}
          />
          <Glass level="sheet" className={styles.pill}>
            <span className={styles.pillName}>{view.place ?? 'Event location'}</span>
            {openMaps ? (
              <a
                href={openMaps}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.pillLink}
              >
                Open in Maps
              </a>
            ) : null}
          </Glass>
        </div>
      ) : null}
    </Card>
  );
}

/** Proportional Going / Can't go / Maybe / No reply bar. Every segment also has an icon and a mono count. */
function RsvpBar({
  counts,
}: {
  counts: { going: number; not_going: number; maybe: number; no_reply: number };
}) {
  const segs = rsvpSegments(counts);
  const total = segs.reduce((n, s) => n + s.value, 0);
  const ICON = {
    going: 'check-circle',
    not_going: 'x-circle',
    maybe: 'question',
    no_reply: 'minus-circle',
  } as const;
  return (
    <div className={styles.rsvp} role="group" aria-label="RSVP counts">
      <div className={styles.bar} aria-hidden>
        {total > 0
          ? segs
              .filter((s) => s.value > 0)
              .map((s) => (
                <span
                  key={s.key}
                  className={`${styles.seg} ${styles[`seg_${s.key}`]}`}
                  style={{ flexGrow: s.value }}
                />
              ))
          : null}
      </div>
      <ul className={styles.legend}>
        {segs.map((s) => (
          <li key={s.key} aria-label={`${s.value} ${s.label}`}>
            <Icon name={ICON[s.key]} weight="fill" size="sm" />
            <span className={styles.countValue}>{s.value}</span>
            <span className={styles.countLabel}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
