'use client';

import { friendlyError } from '@athleit/core';
import { startConnectOnboarding } from '@athleit/db/payments';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ErrorState, LoadingSkeleton } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

/** The onboarding link expired or was already used: make a fresh one and continue. */
function Refresh() {
  const params = useSearchParams();
  const team = params.get('team');
  const club = params.get('club');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const owner = team ? { teamId: team } : club ? { clubId: club } : null;
    if (!owner) return;
    void startConnectOnboarding(getClient(), owner, 'web', 'link').then((r) => {
      if (r.error) setError(friendlyError(r.error));
      else if (r.data.url) window.location.href = r.data.url;
    });
  }, [team, club]);
  return error ? <ErrorState message={error} /> : <LoadingSkeleton />;
}

export default function ConnectRefreshPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <Refresh />
    </Suspense>
  );
}
