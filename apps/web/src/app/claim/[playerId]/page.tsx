'use client';

import { friendlyError } from '@athleit/core';
import { claimPlayerLogin } from '@athleit/db/api';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { AppProvider } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { Shell } from '@/components/app/shell';
import { FormMessage } from '@/components/app/states';
import { Button, Card } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

function Claim() {
  const { playerId } = useParams<{ playerId: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'approved' | 'pending' | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    const res = await claimPlayerLogin(getClient(), playerId);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setOutcome(res.data === 'approved' ? 'approved' : 'pending');
  }

  return (
    <Card className={styles.stack} data-testid="claim-card">
      <h1 className={styles.title}>Use this account as your player login</h1>
      {outcome === 'approved' && (
        <>
          <p role="status" className={`${styles.notice} ${styles.success}`}>
            You’re linked. You can now see your teams.
          </p>
          <Button onClick={() => router.replace('/')}>Continue</Button>
        </>
      )}
      {outcome === 'pending' && (
        <p role="status" className={styles.notice} data-testid="claim-pending">
          Request sent. Your parent or guardian needs to approve it before your login is linked. (If
          you signed in with a different email than they entered, this is expected.)
        </p>
      )}
      {!outcome && (
        <>
          <p className={styles.muted}>
            Players aged 13 or older can sign in themselves. If this account’s email matches the one
            your parent or guardian entered, you’re linked right away. Otherwise they’ll be asked to
            approve.
          </p>
          <FormMessage error={error} />
          <Button onClick={() => void claim()} loading={busy}>
            Link my login
          </Button>
        </>
      )}
    </Card>
  );
}

export default function ClaimPage() {
  return (
    <AppProvider>
      <Shell>
        <Claim />
      </Shell>
    </AppProvider>
  );
}
