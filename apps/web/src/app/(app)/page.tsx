'use client';

import { useApp } from '@/components/app/app-provider';
import { HomeDashboard } from '@/components/home/home-dashboard';
import { FirstRun, PendingStrip } from '@/components/onboarding/first-run';

/** Home dashboard for the active place, or the first-run hub (or Pending card) when the user has none yet. */
export default function HomePage() {
  const { active, displayName } = useApp();

  if (active) {
    return (
      <>
        <PendingStrip />
        <HomeDashboard />
      </>
    );
  }
  return <FirstRun displayName={displayName} />;
}
