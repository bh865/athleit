'use client';

import { TEAM_TAB_LABEL, teamTabHref, type TeamTab } from '@athleit/core';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { Badge } from '@/components/ui';

import styles from './team.module.css';

/** Sticky pill row for the team's tabs. Tabs with pending work carry a count; the active pill scrolls into view. */
export function TabRow({
  teamId,
  tabs,
  active,
  counts,
}: {
  teamId: string;
  tabs: readonly TeamTab[];
  active: TeamTab;
  counts: Partial<Record<TeamTab, number>>;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // jsdom and older browsers may not implement this; the row still scrolls by hand.
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [active]);
  return (
    <nav className={styles.tabs} aria-label="Team sections" data-testid="team-tabs">
      {tabs.map((t) => {
        const n = counts[t] ?? 0;
        const on = t === active;
        return (
          <Link
            key={t}
            ref={on ? activeRef : undefined}
            href={teamTabHref(teamId, t)}
            className={`${styles.tab} ${on ? styles.tabActive : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            {TEAM_TAB_LABEL[t]}
            {n > 0 ? (
              <Badge tone="count">
                <span aria-hidden>{n}</span>
                <span className={styles.srOnly}>{`, ${n} pending`}</span>
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
