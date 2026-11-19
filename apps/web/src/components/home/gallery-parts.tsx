'use client';

import { deriveAttention, type AttentionItem } from '@athleit/core';

import { Badge, ButtonLink, Text } from '@/components/ui';

import { AttentionStrip } from './attention-strip';
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
        <TileShell id="g-hero" title="Next up" res={OK} empty={false} hasData>
          <Text variant="heading">Game vs. Hawks</Text>
          <Text muted>Sat 10:00 AM · Field 3, Riverside Park</Text>
        </TileShell>
        <TileShell id="g-record" title="Fall 2026 · Record" href="#" res={OK} empty={false} hasData>
          <span className={styles.record}>5–2–1</span>
          <Text variant="caption" muted>
            Wins · Losses · Ties
          </Text>
        </TileShell>
      </div>
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
