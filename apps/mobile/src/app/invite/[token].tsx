import { contextPath, friendlyError, ROLE_LABELS } from '@athleit/core';
import { acceptInvite, previewInvite } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1, LoadState } from '@/components/app/kit';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';
import { kv, PENDING_INVITE_KEY } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const KIND = { team: 'team', club: 'club', household: 'family' } as const;

function Landing({ token }: { token: string }) {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const preview = useLoad(() => previewInvite(supabase, token), [token]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = preview.data?.[0];

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await acceptInvite(supabase, token);
    setBusy(false);
    const joined = res.data?.[0];
    if (res.error || !joined) return setError(friendlyError(res.error));
    await refresh();
    const id = (joined.team_id ?? joined.club_id ?? joined.household_id) as string;
    const kind = joined.team_id ? 'team' : joined.club_id ? 'club' : 'family';
    setActive(kind === 'family' ? `family:${id}` : `${kind}:${id}:${joined.role}`);
    router.replace(contextPath({ kind, id } as never) as never);
  }

  const role = p?.role ? (ROLE_LABELS[p.role] ?? p.role) : '';
  return (
    <AppScreen>
      <LoadState loading={preview.loading} error={preview.error} onRetry={preview.reload}>
        <Card style={{ gap: space[3] }} testID="invite-landing">
          {p?.valid ? (
            <>
              <H1>
                Join {p.target_name} as {role.toLowerCase()}
              </H1>
              <Text muted>
                You’ve been invited to the {p.kind ? KIND[p.kind as keyof typeof KIND] : ''}{' '}
                {p.target_name}.
              </Text>
              <FormMessage error={error} />
              <Button title="Accept invite" loading={busy} onPress={() => void accept()} />
            </>
          ) : (
            <>
              <H1>This invite can’t be used</H1>
              <Text accessibilityRole="alert">
                {friendlyError({ message: p?.reason ?? 'invite_invalid' })}
              </Text>
              <Button
                title="Go to Athleit"
                variant="secondary"
                onPress={() => router.replace('/')}
              />
            </>
          )}
        </Card>
      </LoadState>
    </AppScreen>
  );
}

/** Opened from a shared link or QR code (athleit://invite/… or the universal link). */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const router = useRouter();

  if (!session) {
    // Remember the invite across sign-in/sign-up; the home screen resumes it.
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <Card style={{ gap: space[3] }}>
          <H1>You’ve been invited</H1>
          <Text muted>Sign in or create an account to see and accept this invite.</Text>
          <Button
            title="Sign in"
            onPress={async () => {
              await kv.set(PENDING_INVITE_KEY, token);
              router.replace('/sign-in');
            }}
          />
          <Button
            title="Create an account"
            variant="secondary"
            onPress={async () => {
              await kv.set(PENDING_INVITE_KEY, token);
              router.replace('/sign-up');
            }}
          />
        </Card>
      </Screen>
    );
  }
  return <Landing token={token} />;
}
