'use client';

import { friendlyError } from '@athleit/core';
import { startConnectOnboarding } from '@athleit/db/payments';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ErrorState, LoadingSkeleton } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

/** Stripe sends people back here after hosted onboarding (or the link expired). Sync the status, then go to Payments. */
function Return() {
  const router = useRouter();
  const params = useSearchParams();
  const team = params.get('team');
  const club = params.get('club');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const owner = team ? { teamId: team } : club ? { clubId: club } : null;
    if (!owner) return void router.replace('/');
    const dest = team ? `/teams/${team}/payments` : `/clubs/${club}/payments`;
    void startConnectOnboarding(getClient(), owner, 'web', 'sync').then((r) => {
      if (r.error) setError(friendlyError(r.error));
      else router.replace(dest);
    });
  }, [team, club, router]);
  return error ? (
    <ErrorState message={error} onRetry={() => router.refresh()} />
  ) : (
    <LoadingSkeleton />
  );
}

export default function ConnectReturnPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <Return />
    </Suspense>
  );
}
