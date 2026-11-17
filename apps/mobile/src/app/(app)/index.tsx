import { contextPath } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { H1, Notice } from '@/components/app/kit';
import { Button, Card, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { kv, PENDING_INVITE_KEY } from '@/lib/kv';

const HREF = {
  'add-family': '/family/children/new',
  'create-team': '/teams/new',
  'create-club': '/clubs/new',
  'join-team': '/join',
} as const;
const LABEL = {
  'add-family': 'Add my child',
  'create-team': 'Create a team',
  'create-club': 'Create a club',
  'join-team': 'Join a team with a code',
} as const;

/** Resumes a pending invite, then opens the last-used context (or onboards a new user). */
export default function HomeScreen() {
  const { active, displayName, addActions, status } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'ready') return;
    let live = true;
    kv.get(PENDING_INVITE_KEY).then(async (token) => {
      if (!live) return;
      if (token) {
        await kv.remove(PENDING_INVITE_KEY);
        router.replace(
          (token.startsWith('__claim__')
            ? `/claim/${token.slice(9)}`
            : `/invite/${token}`) as never,
        );
      } else if (active) {
        router.replace(contextPath(active) as never);
      }
    });
    return () => {
      live = false;
    };
  }, [status, active, router]);

  return (
    <AppScreen>
      {active ? (
        <Notice>Opening {active.title}…</Notice>
      ) : (
        <Card style={{ gap: space[4] }}>
          <H1>Welcome{displayName ? `, ${displayName}` : ''}</H1>
          <Text muted>How will you use Athleit? You can add more roles any time.</Text>
          <View style={{ gap: space[3] }}>
            {addActions.map((a, i) => (
              <Button
                key={a}
                title={LABEL[a]}
                variant={i === 0 ? 'primary' : 'secondary'}
                onPress={() => router.push(HREF[a] as never)}
              />
            ))}
          </View>
        </Card>
      )}
    </AppScreen>
  );
}
