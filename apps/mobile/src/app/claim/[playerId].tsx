import { friendlyError } from '@athleit/core';
import { claimPlayerLogin } from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1, Notice } from '@/components/app/kit';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { kv, PENDING_INVITE_KEY } from '@/lib/kv';
import { supabase } from '@/lib/supabase';

export default function ClaimScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'approved' | 'pending' | null>(null);

  if (!session) {
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <Card style={{ gap: spacing[3] }}>
          <H1>Sign in to link your player login</H1>
          <Button
            title="Sign in"
            onPress={async () => {
              await kv.set(PENDING_INVITE_KEY, `__claim__${playerId}`);
              router.replace('/sign-in');
            }}
          />
        </Card>
      </Screen>
    );
  }

  async function claim() {
    setBusy(true);
    setError(null);
    const res = await claimPlayerLogin(supabase, playerId);
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setOutcome(res.data === 'approved' ? 'approved' : 'pending');
  }

  return (
    <AppScreen>
      <Card style={{ gap: spacing[3] }} testID="claim-card">
        <H1>Use this account as your player login</H1>
        {outcome === 'approved' && (
          <>
            <Notice tone="success">You’re linked. You can now see your teams.</Notice>
            <Button title="Continue" onPress={() => router.replace('/')} />
          </>
        )}
        {outcome === 'pending' && (
          <Notice testID="claim-pending">
            Request sent. Your parent or guardian needs to approve it before your login is linked.
          </Notice>
        )}
        {!outcome && (
          <>
            <Text muted>
              Players aged 13 or older can sign in themselves. If this account’s email matches the
              one your parent or guardian entered, you’re linked right away. Otherwise they’ll be
              asked to approve.
            </Text>
            <FormMessage error={error} />
            <Button title="Link my login" loading={busy} onPress={() => void claim()} />
          </>
        )}
      </Card>
    </AppScreen>
  );
}
