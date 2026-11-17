'use client';

import { contextPath } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { Button, Card } from '@/components/ui';

/** Sends the user to their last-used context, or onboards them if they have none yet. */
export default function HomePage() {
  const { active, displayName, addActions } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (active) router.replace(contextPath(active));
  }, [active, router]);

  if (active)
    return (
      <p className={styles.muted} role="status">
        Opening {active.title}…
      </p>
    );

  const href = {
    'add-family': '/family/children/new',
    'create-team': '/teams/new',
    'create-club': '/clubs/new',
    'join-team': '/join',
  } as const;
  const label = {
    'add-family': 'Add my child',
    'create-team': 'Create a team',
    'create-club': 'Create a club',
    'join-team': 'Join a team with a code',
  } as const;

  return (
    <Card className={styles.stack}>
      <h1 className={styles.title} data-testid="display-name">
        Welcome{displayName ? `, ${displayName}` : ''}
      </h1>
      <p className={styles.muted}>How will you use Athleit? You can add more roles any time.</p>
      <div className={styles.stack}>
        {addActions.map((a, i) => (
          <Button
            key={a}
            variant={i === 0 ? 'primary' : 'secondary'}
            fullWidth
            onClick={() => router.push(href[a])}
          >
            {label[a]}
          </Button>
        ))}
      </div>
    </Card>
  );
}
