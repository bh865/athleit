import { space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Badge, H1, Segmented } from '@/components/app/kit';
import { InvitesSection } from '@/components/team/invites';
import { MembersSection } from '@/components/team/members';
import { RequestsSection } from '@/components/team/requests';
import { SettingsSection } from '@/components/team/settings';
import { TeamProvider, useTeam } from '@/components/team/team-context';
import { NextUpCard } from '@/components/schedule/next-up-card';
import { Button, Card, Text } from '@/components/ui';

type Section = 'roster' | 'requests' | 'invites' | 'members' | 'settings';

function TeamBody() {
  const { team, caps } = useTeam();
  const router = useRouter();
  const [section, setSection] = useState<Section>('roster');
  const tabs = (
    [
      { value: 'roster', label: 'Overview', show: caps.has('roster.viewLimited') },
      { value: 'requests', label: 'Requests', show: caps.has('joinRequests.decide') },
      { value: 'invites', label: 'Invites', show: caps.has('invites.createFamily') },
      { value: 'members', label: 'Members', show: caps.has('members.view') },
      { value: 'settings', label: 'Settings', show: caps.has('team.edit') },
    ] as const
  ).filter((t) => t.show);
  const current = tabs.some((t) => t.value === section) ? section : 'roster';
  return (
    <>
      <View style={{ gap: space[1] }}>
        <H1>{team.name}</H1>
        <Text muted>
          {team.sport.charAt(0).toUpperCase() + team.sport.slice(1)} · {team.season_label}
        </Text>
        {!caps.has('roster.edit') && caps.has('roster.viewFull') && <Badge>Read only</Badge>}
      </View>
      {caps.has('schedule.view') ? <NextUpCard /> : null}
      <Segmented value={current} options={tabs} onChange={setSection} />
      {current === 'roster' && (
        <Card style={{ gap: space[3] }}>
          <Text variant="heading">Roster</Text>
          <Text muted>The full list lives on the Roster screen.</Text>
          <Button
            title="Open roster"
            icon="arrow-right"
            onPress={() => router.push('/roster' as never)}
          />
        </Card>
      )}
      {current === 'requests' && <RequestsSection />}
      {current === 'invites' && <InvitesSection />}
      {current === 'members' && <MembersSection />}
      {current === 'settings' && <SettingsSection />}
    </>
  );
}

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AppScreen>
      <TeamProvider teamId={id}>
        <TeamBody />
      </TeamProvider>
    </AppScreen>
  );
}
