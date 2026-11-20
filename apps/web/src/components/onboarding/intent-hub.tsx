'use client';

import { ONBOARDING_PATHS } from '@athleit/core';
import Link from 'next/link';

import { Button } from '@/components/ui';

import styles from './onboarding.module.css';

const HREF = {
  parent: '/onboarding/parent',
  coach: '/onboarding/coach',
  club: '/onboarding/club',
  player: '/onboarding/player',
  code: '/onboarding/code',
} as const;
const TITLE = {
  parent: 'I’m a parent or guardian',
  coach: 'I coach or manage a team',
  club: 'I run a club or league',
  player: 'I’m a player (13 or older)',
  code: 'I have a code or an invite',
} as const;
const SUBTITLE = {
  parent: 'Add your child and join their team.',
  coach: 'Create a team and invite families.',
  club: 'Group teams under one club.',
  player: 'Use the link from your parent or coach.',
  code: 'Join a team or family you’ve been invited to.',
} as const;

/**
 * "What brings you here?" The first run shows all five; the returning version leads with the code path.
 * Choosing a card only navigates: nothing is created until a path's last step.
 */
export function IntentHub({
  returning,
  onSkip,
}: {
  returning?: boolean;
  onSkip?: (() => void) | undefined;
}) {
  const paths = returning
    ? [...ONBOARDING_PATHS]
        .sort((a) => (a.intent === 'code' ? -1 : 0))
        .filter((p) => p.intent !== 'player')
    : ONBOARDING_PATHS;
  return (
    <div className={styles.stack}>
      <ul className={styles.hubList}>
        {paths.map((p) => (
          <li key={p.intent}>
            <Link href={HREF[p.intent]} className={styles.hubCard} data-testid={`hub-${p.intent}`}>
              <span className={styles.hubTitle}>
                {returning && p.intent === 'code' ? 'Rejoin or join with a code' : TITLE[p.intent]}
              </span>
              <span className={styles.muted}>
                {returning && p.intent === 'code'
                  ? 'Use a team code or a family code.'
                  : SUBTITLE[p.intent]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {onSkip ? (
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      ) : null}
    </div>
  );
}
