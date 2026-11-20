import { countsBar, type RsvpCounts } from '@athleit/core';

import { Icon, Mono } from '@/components/ui';

import styles from './schedule.module.css';

const ICON = {
  going: 'check-circle',
  not_going: 'x-circle',
  maybe: 'question',
  no_reply: 'circle-dashed',
} as const;

/** Going, Can't go, Maybe and No reply: a thin stacked bar plus a legend (icon, mono number, word). */
export function CountsBar({
  counts,
  legend = true,
}: {
  counts: RsvpCounts;
  /** Rows show the bar and four numbers; the detail also spells out the words. */
  legend?: boolean;
}) {
  const bar = countsBar(counts);
  return (
    <div className={styles.counts} data-testid="rsvp-counts" role="group" aria-label={`Replies: ${bar.spoken}`}>
      <div className={styles.countsBar} aria-hidden>
        {bar.segments.map((s) => (
          <span
            key={s.key}
            className={`${styles.countsSeg} ${styles[`seg_${s.key}`]}`}
            style={{ flexGrow: s.value }}
          />
        ))}
      </div>
      <ul className={styles.countsLegend} aria-hidden>
        {(['going', 'not_going', 'maybe', 'no_reply'] as const).map((k) => (
          <li key={k} className={styles.countsItem}>
            <Icon name={ICON[k]} size="sm" />
            <Mono>{counts[k]}</Mono>
            {legend ? (
              <span>{k === 'going' ? 'Going' : k === 'not_going' ? 'Can’t go' : k === 'maybe' ? 'Maybe' : 'No reply'}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
