import { space } from '@athleit/tokens';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { BackLink, Badge, H1, Segmented } from '@/components/app/kit';
import { InvitesSection } from '@/components/team/invites';
import { MembersSection } from '@/components/team/members';
import { RequestsSection } from '@/components/team/requests';
import { RosterSection } from '@/components/team/roster';
import { SettingsSection } from '@/components/team/settings';
import { TeamProvider, useTeam } from '@/components/team/team-context';
import { Text } from '@/components/ui';

type Section = 'roster' | 'requests' | 'invites' | 'members' | 'settings';

function TeamBody() {
  const { team, caps } = useTeam();
  const [section, setSection] = useState<Section>('roster');
  const tabs = (
    [
      { value: 'roster', label: 'Roster', show: caps.has('roster.viewLimited') },
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
      <Segmented value={current} options={tabs} onChange={setSection} />
      {current === 'roster' && <RosterSection />}
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
      <BackLink label="Back" />
      <TeamProvider teamId={id}>
        <TeamBody />
      </TeamProvider>
    </AppScreen>
  );
}
