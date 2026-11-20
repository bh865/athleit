import { ONBOARDING_PATHS, type OnboardingIntent } from '@athleit/core';
import { space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { H1 } from '@/components/app/kit';
import { Button, Icon, IconCircle, ListGroup, ListRow, Text } from '@/components/ui';

const ICON: Record<OnboardingIntent, IconName> = {
  parent: 'house-line',
  coach: 'flag',
  club: 'buildings',
  player: 'user',
  code: 'hash',
};
const HREF: Record<OnboardingIntent, string> = {
  parent: '/onboarding/parent',
  coach: '/onboarding/coach',
  club: '/onboarding/club',
  player: '/onboarding/player',
  code: '/onboarding/code',
};
const SUBTITLE: Record<OnboardingIntent, string> = {
  parent: 'Add your child and join their team.',
  coach: 'Create a team and invite families.',
  club: 'Group teams under one club.',
  player: 'Use the link from your parent or coach.',
  code: 'Join a team or family you’ve been invited to.',
};
const TITLE: Partial<Record<OnboardingIntent, string>> = {
  parent: 'I’m a parent or guardian',
  club: 'I run a club or league',
  player: 'I’m a player (13 or older)',
  code: 'I have a code or an invite',
};

/**
 * "What brings you here?" The first run shows all five; the returning version leads with the code
 * path and is quieter. Choosing a card only navigates: nothing is created until a path's last step.
 */
export function IntentHub({ returning, onSkip }: { returning?: boolean; onSkip?: () => void }) {
  const router = useRouter();
  const paths = returning
    ? [...ONBOARDING_PATHS]
        .sort((a) => (a.intent === 'code' ? -1 : 0))
        .filter((p) => p.intent !== 'player')
    : ONBOARDING_PATHS;
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ gap: space[2] }}>
        <H1>{returning ? 'You’re not on any team right now' : 'What brings you here?'}</H1>
        <Text muted>
          {returning
            ? 'Join or start something new.'
            : 'Pick the closest one. You can add more later.'}
        </Text>
      </View>
      <ListGroup>
        {paths.map((p, i) => (
          <ListRow
            key={p.intent}
            testID={`hub-${p.intent}`}
            leading={
              <IconCircle>
                <Icon name={ICON[p.intent]} size="md" />
              </IconCircle>
            }
            title={
              returning && p.intent === 'code'
                ? 'Rejoin or join with a code'
                : (TITLE[p.intent] ?? p.title)
            }
            subtitle={
              returning && p.intent === 'code'
                ? 'Use a team code or a family code.'
                : SUBTITLE[p.intent]
            }
            onPress={() => router.push(HREF[p.intent] as never)}
            last={i === paths.length - 1}
          />
        ))}
      </ListGroup>
      {onSkip ? <Button title="Skip for now" variant="ghost" onPress={onSkip} /> : null}
    </View>
  );
}
