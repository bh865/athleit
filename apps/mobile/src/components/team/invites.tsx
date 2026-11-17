import { spacing } from '@athleit/tokens';
import { View } from 'react-native';

import { InvitePanel, type RoleOption } from '@/components/app/invite-panel';
import { H2, Notice } from '@/components/app/kit';
import { Text } from '@/components/ui';

import { useTeam } from './team-context';

const STAFF: RoleOption[] = [
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];
const FAMILY: RoleOption[] = [{ value: 'parent', label: 'Parent' }];

export function InvitesSection() {
  const { team, caps } = useTeam();
  if (!caps.has('invites.createFamily'))
    return <Notice>Only team staff can create invites.</Notice>;
  const roles = caps.has('invites.createStaff') ? [...STAFF, ...FAMILY] : FAMILY;
  return (
    <View style={{ gap: spacing[3] }}>
      <H2>Invite people</H2>
      <Text muted>
        {caps.has('invites.createStaff')
          ? 'Coaches, managers and admins join only through an invite link you create here.'
          : 'You can invite parents. Only team admins can invite staff.'}
      </Text>
      <InvitePanel target={{ teamId: team.id }} roles={roles} />
    </View>
  );
}
