import { capabilitiesForPlace } from '@athleit/core';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { ADD } from '@/components/app/context-switcher';
import { useScreenTitle } from '@/components/app/screen-title';
import { Avatar, Button, Icon, IconCircle, ListGroup, ListRow, ThemeToggle } from '@/components/ui';
import type { IconName } from '@athleit/ui-core';
import { useApp } from '@/lib/app-provider';
import { useAuth } from '@/lib/auth';

/** The More tab: a full screen (not a drawer) with account, extra pages, add/join, theme and sign out. */
export default function MoreScreen() {
  useScreenTitle('More');
  const router = useRouter();
  const { signOut } = useAuth();
  const { contexts, active: place, addActions, displayName, email, avatarUrl } = useApp();
  const hasTeam = contexts.some((c) => c.kind === 'team');
  const hasFamily = contexts.some((c) => c.kind === 'family');
  const settingsTeamId =
    place?.kind === 'team' && capabilitiesForPlace(contexts, 'team', place.id).has('team.details')
      ? place.id
      : null;

  const rows: { title: string; icon: IconName; href: string }[] = [
    ...(hasTeam ? [{ title: 'Roster', icon: 'users-three' as const, href: '/roster' }] : []),
    ...(settingsTeamId
      ? [{ title: 'Settings', icon: 'gear' as const, href: `/teams/${settingsTeamId}` }]
      : []),
    ...(hasFamily ? [{ title: 'Family', icon: 'house-line' as const, href: '/family' }] : []),
    ...(hasFamily
      ? [{ title: 'Registrations', icon: 'clipboard-text' as const, href: '/registrations' }]
      : []),
    { title: 'Alerts', icon: 'bell', href: '/notifications' },
  ];

  return (
    <AppScreen>
      <View style={{ gap: space[6] }}>
        <ListGroup>
          <ListRow
            testID="more-account-chip"
            leading={<Avatar name={displayName ?? email ?? 'Account'} src={avatarUrl} size="md" />}
            title={displayName ?? email ?? 'Account'}
            subtitle={displayName && email ? email : undefined}
            onPress={() => router.push('/account' as never)}
            last
          />
        </ListGroup>
        <ListGroup>
          {rows.map((r, i) => (
            <ListRow
              key={r.href}
              title={r.title}
              leading={
                <IconCircle>
                  <Icon name={r.icon} size="md" />
                </IconCircle>
              }
              onPress={() => router.push(r.href as never)}
              last={i === rows.length - 1}
            />
          ))}
        </ListGroup>
        {addActions.length ? (
          <View style={{ gap: space[2] }}>
            {addActions.map((a) => (
              <Button
                key={a}
                title={ADD[a].label}
                variant="ghost"
                icon="plus"
                onPress={() => router.push(ADD[a].href as never)}
              />
            ))}
          </View>
        ) : null}
        <Button
          title="Join or start something"
          variant="ghost"
          icon="plus"
          onPress={() => router.push('/onboarding' as never)}
        />
        <ThemeToggle />
        <Button title="Sign out" variant="ghost" icon="sign-out" onPress={() => void signOut()} />
      </View>
    </AppScreen>
  );
}
