'use client';

import { contextPath, friendlyError, ROLE_LABELS } from '@athleit/core';
import { acceptInvite, previewInvite } from '@athleit/db/api';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { AppProvider, useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { Shell } from '@/components/app/shell';
import { FormMessage, LoadState } from '@/components/app/states';
import { Button, Card } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

const KIND_LABEL = { team: 'team', club: 'club', household: 'family' } as const;

function Landing() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { refresh, contexts, setActive } = useApp();
  const client = getClient();
  const preview = useLoad(() => previewInvite(client, token), [token]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = preview.data?.[0];

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await acceptInvite(client, token);
    setBusy(false);
    if (res.error || !res.data[0]) return setError(friendlyError(res.error));
    const joined = res.data[0];
    await refresh();
    const id = joined.team_id ?? joined.club_id ?? joined.household_id;
    const kind = joined.team_id ? 'team' : joined.club_id ? 'club' : 'family';
    const key = kind === 'family' ? `family:${id}` : `${kind}:${id}:${joined.role}`;
    setActive(key);
    router.replace(contextPath({ kind, id: id as string } as never));
  }

  const role = p?.role ? (ROLE_LABELS[p.role] ?? p.role) : '';

  return (
    <LoadState loading={preview.loading} error={preview.error} onRetry={preview.reload}>
      <Card className={styles.stack} data-testid="invite-landing">
        {p?.valid ? (
          <>
            <h1 className={styles.title}>
              Join {p.target_name} as {role.toLowerCase()}
            </h1>
            <p className={styles.muted}>
              You’ve been invited to the{' '}
              {p.kind ? KIND_LABEL[p.kind as keyof typeof KIND_LABEL] : ''} {p.target_name}.
              {contexts.length > 0 ? ' This adds a new role to your account.' : ''}
            </p>
            <FormMessage error={error} />
            <Button onClick={() => void accept()} loading={busy}>
              Accept invite
            </Button>
          </>
        ) : (
          <>
            <h1 className={styles.title}>This invite can’t be used</h1>
            <p role="alert">{friendlyError({ message: p?.reason ?? 'invite_invalid' })}</p>
            <Button variant="secondary" onClick={() => router.replace('/')}>
              Go to Athleit
            </Button>
          </>
        )}
      </Card>
    </LoadState>
  );
}

/** Reached from an emailed/shared link or QR code. Signed-out visitors are sent to sign in first. */
export default function InvitePage() {
  return (
    <AppProvider>
      <Shell>
        <Landing />
      </Shell>
    </AppProvider>
  );
}
