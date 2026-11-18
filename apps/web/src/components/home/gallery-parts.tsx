'use client';

import type { AttentionItem } from '@athleit/core';

import { Badge, ButtonLink, Text } from '@/components/ui';

import { AttentionStrip } from './attention-strip';
import styles from './home.module.css';
import { TileShell } from './tile-shell';

const ITEMS: AttentionItem[] = [
  { kind: 'rsvp', key: 'a', label: 'RSVP for Maya', detail: 'Game Sat 10:00 AM', href: '#' },
  { kind: 'waiver', key: 'b', label: 'Sign Maya’s waiver', detail: 'Expired Nov 15', href: '#' },
  {
    kind: 'payment',
    key: 'c',
    label: 'Pay jersey fee',
    detail: '$45.00 · due in 3 days',
    href: '#',
  },
];
const MORE: AttentionItem[] = [
  { kind: 'joinRequests', key: 'd', label: '2 join requests', href: '#' },
];
const OK = { loading: false, error: null, reload: () => undefined };
const WEEK = [
  ['THU', '19', 'Practice', '5:30 PM · Field 2', 'Going'],
  ['SAT', '21', 'Game vs. Hawks', '10:00 AM · Field 3', 'No reply'],
] as const;

/** Static fixtures only (no network) so the visual baselines never move with data. */
export function HomeGallery() {
  return (
    <div className={styles.page}>
      <AttentionStrip shown={ITEMS} more={MORE} />
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
      <div className={styles.row3}>
        <TileShell
          id="g-week"
          title="This week · Maya"
          href="#"
          linkLabel="See full schedule"
          res={OK}
          empty={false}
          hasData
        >
          <ul className={styles.threads}>
            {WEEK.map(([d, n, t, w, pill]) => (
              <li key={n} className={styles.weekRow}>
                <span className={styles.weekDate}>
                  <span className={styles.weekDay}>{d}</span>
                  <span className={styles.weekNum}>{n}</span>
                </span>
                <span className={styles.weekText}>
                  <span className={styles.threadTitle}>{t}</span>
                  <span className={styles.threadPreview}>{w}</span>
                </span>
                <Badge tone="neutral">{pill}</Badge>
              </li>
            ))}
          </ul>
        </TileShell>
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
