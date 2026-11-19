'use client';

import { deriveAttention, type AttentionItem, type NextUpView } from '@athleit/core';

import { Badge, ButtonLink, Text } from '@/components/ui';

import { AttentionStrip } from './attention-strip';
import { NextUpCard } from './next-up-hero';
import styles from './home.module.css';
import { TileShell } from './tile-shell';

const NOW = new Date('2026-11-19T17:00:00Z');
const ITEMS: AttentionItem[] = [
  {
    kind: 'waiver',
    key: 'b',
    label: 'Sign Maya’s waiver',
    detail: 'Liability waiver expired',
    href: '#',
    dueAt: '2026-11-15T17:00:00Z',
    dueMode: 'expired',
    placeTag: 'Household',
  },
  {
    kind: 'rsvp',
    key: 'a',
    label: 'RSVP for Maya',
    href: '#',
    dueAt: '2026-11-21T15:00:00Z',
    dueMode: 'event',
    eventNoun: 'Game',
    placeTag: 'Household',
    action: { type: 'rsvp', eventId: 'e1', playerId: 'p1', firstName: 'Maya' },
  },
  {
    kind: 'payment',
    key: 'c',
    label: 'Pay jersey fee',
    detail: '$45.00',
    href: '#',
    dueAt: '2026-11-22T17:00:00Z',
    placeTag: 'Household',
  },
  {
    kind: 'joinRequests',
    key: 'd',
    label: '2 join requests',
    detail: 'Approve or decline',
    href: '#',
    count: 2,
    placeTag: 'U12 Falcons',
  },
  { kind: 'setup', key: 'e', label: 'Finish team setup', href: '#', placeTag: 'U12 Falcons' },
];
const ZONE = 'America/New_York';
const GAME: NextUpView = {
  event: {
    eventId: 'g1',
    type: 'game',
    title: 'Game vs. Hawks',
    startsAt: '2026-11-21T15:00:00Z',
    endsAt: '2026-11-21T17:00:00Z',
    timezone: ZONE,
    status: 'scheduled',
    revision: 1,
  },
  place: 'Field 3, Riverside Park',
  address: null,
  lat: null,
  lng: null,
  placeId: null,
  homeAway: 'home',
  opponent: 'Hawks',
  arriveEarly: 30,
  counts: { going: 11, not_going: 2, maybe: 1, no_reply: 4 },
  children: [
    { player_id: 'p1', first_name: 'Maya', status: 'going' },
    { player_id: 'p2', first_name: 'Eli', status: null },
  ],
  staff: false,
};
const STAFF: NextUpView = { ...GAME, children: [], staff: true };
const BLANK_MAP = 'about:blank';
const OK = { loading: false, error: null, reload: () => undefined };
const NONE = { shown: [], more: [], all: [], lead: null };
const noop = () => undefined;

/** Static fixtures only (no network) so the visual baselines never move with data. */
export function HomeGallery() {
  return (
    <div className={styles.page}>
      <AttentionStrip
        attention={deriveAttention(ITEMS, NOW)}
        loading={false}
        error={null}
        onRetry={noop}
        onResolved={noop}
        now={NOW}
      />
      <AttentionStrip
        attention={NONE}
        loading={false}
        error={null}
        onRetry={noop}
        onResolved={noop}
        now={NOW}
      />
      <div className={styles.heroRow}>
        <NextUpCard
          view={GAME}
          now={new Date('2026-11-19T15:00:00Z')}
          zone={ZONE}
          mapSrc={BLANK_MAP}
        />
        <TileShell id="g-record" title="Fall 2026 · Record" href="#" res={OK} empty={false} hasData>
          <span className={styles.record}>5–2–1</span>
          <Text variant="caption" muted>
            Wins · Losses · Ties
          </Text>
        </TileShell>
      </div>
      <NextUpCard
        view={STAFF}
        now={new Date('2026-11-21T16:00:00Z')}
        zone={ZONE}
        mapSrc={BLANK_MAP}
      />
      <NextUpCard view={STAFF} now={new Date('2026-11-21T18:00:00Z')} zone={ZONE} mapSrc={null} />
      <NextUpCard
        view={{
          ...GAME,
          event: { ...GAME.event, type: 'practice', title: 'Practice' },
          homeAway: null,
          opponent: null,
        }}
        now={new Date('2026-11-19T15:00:00Z')}
        zone={ZONE}
        mapSrc={null}
      />
      <div className={styles.tiles}>
        <TileShell id="g-due" title="Amount due" res={OK} empty={false} hasData>
          <div className={styles.amount}>
            <Badge tone="neutral">1 request</Badge>
            <span className={styles.record}>$45.00</span>
            <Text variant="caption" muted>
              Jersey fee · Maya · due Sat, Nov 21
            </Text>
            <ButtonLink href="#">Pay $45.00</ButtonLink>
          </div>
        </TileShell>
        <TileShell id="g-waivers" title="Waivers" href="#" res={OK} empty={false} hasData>
          <div className={styles.block}>
            <Text variant="bodyBold">Sign Maya’s waiver</Text>
            <Text variant="caption" muted>
              Fall 2026 registration
            </Text>
            <ButtonLink href="#">Sign waiver</ButtonLink>
          </div>
        </TileShell>
        <TileShell
          id="g-loading"
          title="Registrations"
          res={{ ...OK, loading: true }}
          empty={false}
          hasData={false}
        >
          {null}
        </TileShell>
        <TileShell
          id="g-error"
          title="Join requests"
          res={{ ...OK, error: 'x' }}
          empty={false}
          hasData={false}
        >
          {null}
        </TileShell>
      </div>
    </div>
  );
}
