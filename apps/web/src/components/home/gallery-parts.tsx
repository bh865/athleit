'use client';

import type { AttentionItem } from '@athleit/core';

import { Badge, Text } from '@/components/ui';

import { AttentionStrip } from './attention-strip';
import styles from './home.module.css';
import { TileShell } from './tile-shell';

const ITEMS: AttentionItem[] = [
  { kind: 'rsvp', key: 'a', label: 'RSVP for Maya', detail: 'Game Sat 10:00 AM', href: '#' },
  { kind: 'waiver', key: 'b', label: 'Sign Maya’s waiver', detail: 'Expired Nov 15', href: '#' },
  { kind: 'payment', key: 'c', label: 'Pay jersey fee', detail: '$45.00 · due in 3 days', href: '#' },
];
const MORE: AttentionItem[] = [
  { kind: 'joinRequests', key: 'd', label: '2 join requests', href: '#' },
];
const OK = { loading: false, error: null, reload: () => undefined };

/** Static fixtures only (no network) so the visual baselines never move with data. */
export function HomeGallery() {
  return (
    <div className={styles.page}>
      <AttentionStrip shown={ITEMS} more={MORE} />
      <div className={styles.row3}>
        <TileShell id="g-week" title="This week" href="#" linkLabel="See full schedule" res={OK} empty={false} hasData>
          <ul className={styles.threads}>
            <li>
              <span className={styles.threadTitle}>Thu 5:30 PM · Practice</span>
              <span className={styles.threadPreview}>Maya: Going</span>
            </li>
            <li>
              <span className={styles.threadTitle}>Sat 10:00 AM · Game vs. Hawks</span>
              <span className={styles.threadPreview}>Maya: No reply</span>
            </li>
          </ul>
        </TileShell>
        <TileShell id="g-record" title="Team record" href="#" res={OK} empty={false} hasData>
          <div className={styles.stats}>
            {[
              [5, 'Wins'],
              [2, 'Losses'],
              [1, 'Ties'],
            ].map(([v, l]) => (
              <div key={l} className={styles.count}>
                <span className={styles.countValue}>{v}</span>
                <span className={styles.countLabel}>{l}</span>
              </div>
            ))}
          </div>
          <Text variant="caption" muted>
            Fall 2026
          </Text>
        </TileShell>
        <TileShell id="g-waivers" title="Waivers" href="#" res={OK} empty={false} hasData>
          <Badge tone="warning">Eli · Expired</Badge>
          <Badge tone="danger">Zara · Missing</Badge>
        </TileShell>
        <TileShell id="g-loading" title="Registrations" res={{ ...OK, loading: true }} empty={false} hasData={false}>
          {null}
        </TileShell>
        <TileShell id="g-error" title="Join requests" res={{ ...OK, error: 'x' }} empty={false} hasData={false}>
          {null}
        </TileShell>
      </div>
    </div>
  );
}
