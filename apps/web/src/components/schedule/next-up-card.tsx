'use client';

import { describeEventTime, mapsUrl, type RsvpStatus } from '@athleit/core';
import { getNextUp } from '@athleit/db/scheduling';
import Link from 'next/link';

import { Card, ListGroup, ListRow } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { RsvpControls } from './rsvp-controls';
import styles from './schedule.module.css';
import { useViewerZone } from './use-viewer-zone';

interface Child {
  player_id: string;
  first_name: string;
  status: RsvpStatus | null;
}

/**
 * Home "Next up": a kicker with day and time, the title, the place, and Going / Can't go for each
 * of the viewer's children on that team (staff see the RSVP counts). The next few events follow.
 */
export function NextUpCard() {
  const viewerZone = useViewerZone();
  const res = useLoad(() => getNextUp(getClient(), 4), []);
  const rows = res.data ?? [];
  if (res.loading || res.error || rows.length === 0) return null;
  const [top, ...rest] = rows;
  if (!top) return null;
  const t = describeEventTime(top.starts_at, top.ends_at, top.timezone, viewerZone);
  const children = (top.children as unknown as Child[]) ?? [];
  const place = top.location_name ?? top.location_text ?? null;
  const mapHref = mapsUrl({
    placeId: top.location_place_id,
    lat: top.location_lat,
    lng: top.location_lng,
    address: top.location_address,
    name: place,
  });
  return (
    <div className={styles.layout} data-testid="next-up">
      <Card className={styles.layout}>
        <span className={styles.kicker}>
          Next up · {t.weekdayShort} {t.startLabel}
          {rows.some((r) => r.team_id !== top.team_id) ? ` · ${top.team_name}` : ''}
        </span>
        <Link href={`/events/${top.event_id}`} className={styles.detailTitle}>
          {top.title}
        </Link>
        {place ? (
          <span className={styles.meta}>
            {place}
            {mapHref ? (
              <>
                {' · '}
                <a href={mapHref} target="_blank" rel="noopener noreferrer">
                  Open in Maps
                </a>
              </>
            ) : null}
          </span>
        ) : null}
        {children.map((c) => (
          <RsvpControls
            key={c.player_id}
            eventId={top.event_id}
            child={c}
            showName={children.length > 1}
          />
        ))}
        {top.is_staff ? (
          <div className={styles.counts} role="group" aria-label="RSVP counts">
            {[
              { v: top.going, l: 'Going' },
              { v: top.not_going, l: 'Can’t go' },
              { v: top.no_reply, l: 'No reply' },
            ].map((c) => (
              <div key={c.l} className={styles.count}>
                <span className={styles.countValue} aria-label={`${c.v} ${c.l}`}>
                  {c.v}
                </span>
                <span className={styles.countLabel}>{c.l}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
      {rest.length > 0 ? (
        <ListGroup>
          {rest.map((r) => {
            const rt = describeEventTime(r.starts_at, r.ends_at, r.timezone, viewerZone);
            return (
              <li key={r.event_id}>
                <ListRow
                  href={`/events/${r.event_id}`}
                  title={r.title}
                  subtitle={`${rt.dateLabel} · ${rt.startLabel}${r.location_name ? ` · ${r.location_name}` : ''}`}
                />
              </li>
            );
          })}
        </ListGroup>
      ) : null}
    </div>
  );
}
