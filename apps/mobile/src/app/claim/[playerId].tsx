import { friendlyError, linkProblemCopy } from '@athleit/core';
import { claimPlayerLogin } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1, LoadState, Notice } from '@/components/app/kit';
import { ContinueAs, LinkBanner, useClaimBanner } from '@/components/auth/link-banner';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { kv, PENDING_INVITE_KEY, POST_AUTH_INTENT_KEY } from '@/lib/kv';
import { supabase } from '@/lib/supabase';

export default function ClaimScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const preview = useClaimBanner(playerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'approved' | 'pending' | null>(null);

  if (!session) {
    const problem = linkProblemCopy(preview.outcome === 'ok' ? 'invalid' : preview.outcome);
    return (
      <Screen contentStyle={{ justifyContent: 'center' }}>
        <LoadState loading={preview.loading} error={preview.error} onRetry={preview.reload}>
          {preview.banner ? (
            <View style={{ gap: space[4] }}>
              <LinkBanner {...preview.banner} />
              <Text muted>Players 13 and older sign in themselves.</Text>
              <Button
                title="Create account and continue"
                size="lg"
                onPress={async () => {
                  await kv.set(PENDING_INVITE_KEY, `__claim__${playerId}`);
                  router.replace('/sign-up');
                }}
              />
              <Button
                title="I already have an account"
                variant="secondary"
                size="lg"
                onPress={async () => {
                  await kv.set(PENDING_INVITE_KEY, `__claim__${playerId}`);
                  router.replace('/sign-in');
                }}
              />
            </View>
          ) : (
            <View style={{ gap: space[4] }}>
              <H1>{problem.title}</H1>
              <Text accessibilityRole="alert">{problem.body}</Text>
              <Button title="Sign in" size="lg" onPress={() => router.replace('/sign-in')} />
              <Button
                title="I have a code"
                variant="secondary"
                size="lg"
                onPress={() => {
                  void kv.set(POST_AUTH_INTENT_KEY, 'code');
                  router.replace('/sign-up');
                }}
              />
            </View>
          )}
        </LoadState>
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

  const user = session.user;
  const name = (user.user_metadata?.display_name as string | undefined) ?? '';
  return (
    <AppScreen>
      <Card style={{ gap: space[3] }} testID="claim-card">
        {preview.banner ? (
          <LinkBanner {...preview.banner} />
        ) : (
          <H1>Use this account as your player login</H1>
        )}
        {outcome === 'approved' && (
          <>
            <Notice tone="success">You’re linked. You can now see your teams.</Notice>
            <Button title="Continue" onPress={() => router.replace('/')} />
          </>
        )}
        {outcome === 'pending' && (
          <Notice testID="claim-pending">
            Waiting for your parent. Your email didn’t match, so a parent needs to approve. We’ll
            tell you when they do.
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
            <ContinueAs
              name={name}
              email={user.email ?? ''}
              actionTitle="Link my login"
              busy={busy}
              onContinue={() => void claim()}
              onSwitch={async () => {
                await kv.set(PENDING_INVITE_KEY, `__claim__${playerId}`);
                await signOut();
              }}
            />
          </>
        )}
      </Card>
    </AppScreen>
  );
}
