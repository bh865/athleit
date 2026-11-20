import { firstRunState } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { H1, LoadState } from '@/components/app/kit';
import { IntentHub } from '@/components/onboarding/intent-hub';
import { RequestCards } from '@/components/onboarding/request-cards';
import { useMyRequests } from '@/components/onboarding/use-my-requests';
import { Button, EmptyState, Text } from '@/components/ui';
import { HUB_DONE_KEY, HUB_SKIPPED_KEY, kv, POST_AUTH_INTENT_KEY } from '@/lib/kv';

/** Home for someone with no place: their requests if any, otherwise the intent hub. */
export function FirstRun({ displayName }: { displayName: string | null }) {
  const router = useRouter();
  const mine = useMyRequests();
  const [flags, setFlags] = useState<{ done: boolean; skipped: boolean } | null>(null);

  useEffect(() => {
    Promise.all([kv.get(HUB_DONE_KEY), kv.get(HUB_SKIPPED_KEY), kv.get(POST_AUTH_INTENT_KEY)]).then(
      ([d, s, intent]) => {
        setFlags({ done: d === '1', skipped: s === '1' });
        // "I have an invite or a code" on Welcome: open the code path once, then forget it.
        if (intent === 'code') {
          void kv.remove(POST_AUTH_INTENT_KEY);
          router.push('/onboarding/code' as never);
        }
      },
    );
  }, [router]);

  const state = firstRunState({
    hasPlace: false,
    requests: mine.requests,
    completedHubBefore: Boolean(flags?.done),
  });

  return (
    <LoadState
      loading={(mine.loading && !mine.data) || !flags}
      error={mine.error}
      onRetry={mine.reload}
    >
      <View style={{ gap: space[4] }}>
        {mine.requests.length > 0 ? (
          <H1>{`Welcome${displayName ? `, ${displayName.split(' ')[0]}` : ''}`}</H1>
        ) : null}
        <RequestCards requests={mine.requests} hasPlace={false} onChanged={mine.reload} />
        {state === 'pending' ? (
          <View style={{ gap: space[3] }}>
            <Text variant="label" muted>
              WHILE YOU WAIT
            </Text>
            <Button
              title="Add another child"
              variant="secondary"
              onPress={() => router.push('/onboarding/parent' as never)}
            />
            <Button
              title="Use another code"
              variant="secondary"
              onPress={() => router.push('/onboarding/code' as never)}
            />
          </View>
        ) : flags?.skipped && state === 'hub' ? (
          <EmptyState
            icon="house-line"
            title="You’re not on a team yet"
            body="Start whenever you’re ready."
            action={
              <Button
                title="What brings you here?"
                onPress={() => router.push('/onboarding' as never)}
              />
            }
          />
        ) : (
          <IntentHub
            returning={state === 'hubReturning'}
            onSkip={
              state === 'hub'
                ? () => {
                    void kv.set(HUB_SKIPPED_KEY, '1');
                    setFlags((f) => ({ done: Boolean(f?.done), skipped: true }));
                  }
                : undefined
            }
          />
        )}
      </View>
    </LoadState>
  );
}

/** Pending requests above Home for someone who already has a place (for example a family). */
export function PendingStrip() {
  const mine = useMyRequests();
  return <RequestCards requests={mine.requests} hasPlace onChanged={mine.reload} />;
}
