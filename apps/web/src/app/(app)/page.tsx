'use client';

import { useRouter } from 'next/navigation';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { Button, Card, PageHeader } from '@/components/ui';

/** Home dashboard for the active place, or onboarding when the user has none yet. */
export default function HomePage() {
  const { active, displayName, addActions } = useApp();
  const router = useRouter();

  if (active) return <HomeDashboard />;

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
    <>
      <PageHeader
        titleTestId="display-name"
        title={`Welcome${displayName ? `, ${displayName}` : ''}`}
        subtitle="How will you use Athleit? You can add more roles any time."
      />
      <Card className={styles.stack}>
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
    </>
  );
}
