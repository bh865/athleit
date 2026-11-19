'use client';

import { childCard, type ChildLike } from '@athleit/core';
import { getPhotoUrl, type Result } from '@athleit/db/api';
import Link from 'next/link';

import { Avatar, Badge, ChipLabel, Icon } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './family.module.css';

/** A child's profile card on the Family page: photo, name, age, teams, login badge. */
export function ChildCard({ child }: { child: ChildLike }) {
  const c = childCard(child);
  const path = c.photoPath;
  const photo = useLoad(
    () =>
      path
        ? getPhotoUrl(getClient(), path)
        : Promise.resolve({ data: null, error: null } as Result<string | null>),
    [path],
  );
  return (
    <div className={styles.card} data-testid="child-card">
      <div className={styles.cardHead}>
        <Avatar name={c.name} size="lg" src={photo.data} />
        <span className={styles.cardName}>
          {/* Stretched link: the whole card opens the child, while Join a team stays its own link. */}
          <Link href={`/family/children/${c.id}`} className={`${styles.name} ${styles.stretch}`}>
            {c.name}
          </Link>
          <span className={styles.mono}>{c.age} years old</span>
        </span>
        <span className={styles.view} aria-hidden>
          View <Icon name="caret-right" size="sm" />
        </span>
      </div>
      <div className={styles.chips}>
        {c.teams.map((t) => (
          <ChipLabel key={t}>{t}</ChipLabel>
        ))}
        {c.notOnTeam ? (
          <>
            <span>Not on a team yet</span>
            <Link href={`/join?player=${c.id}`} className={`${styles.view} ${styles.above}`}>
              Join a team
            </Link>
          </>
        ) : null}
      </div>
      {c.badge === 'has-login' ? (
        <Badge tone="success">Has login</Badge>
      ) : c.badge === 'no-login-under-13' ? (
        <Badge>No login (under 13)</Badge>
      ) : null}
    </div>
  );
}
