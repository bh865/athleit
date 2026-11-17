import { friendlyError, TEAM_ROLES } from '@athleit/core';
import { getTeamMembers, removeMember, setMemberRole } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Choice, FormMessage, H2, ListItem, LoadState, Notice } from '@/components/app/kit';
import { Button, Card } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeam } from './team-context';

const ROLE_OPTIONS = TEAM_ROLES.map((r) => ({
  value: r,
  label: r.charAt(0).toUpperCase() + r.slice(1),
}));

export function MembersSection() {
  const { team, caps } = useTeam();
  const { userId } = useApp();
  const list = useLoad(() => getTeamMembers(supabase, team.id), [team.id]);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(id: string, role: (typeof TEAM_ROLES)[number]) {
    setError(null);
    const res = await setMemberRole(supabase, id, role);
    if (res.error) setError(friendlyError(res.error)); // e.g. the last admin cannot be demoted
    list.reload();
  }
  async function remove(id: string) {
    setError(null);
    const res = await removeMember(supabase, id);
    if (res.error) setError(friendlyError(res.error));
    list.reload();
  }

  if (!caps.has('members.view')) return <Notice>Only team staff can see members.</Notice>;
  const manage = caps.has('members.manage');
  return (
    <View style={{ gap: space[3] }}>
      <H2>Members</H2>
      <FormMessage error={error} />
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        onRetry={list.reload}
      >
        {list.data?.map((m) => (
          <Card key={m.membership_id} style={{ gap: space[3] }}>
            <ListItem
              title={`${m.display_name}${m.profile_id === userId ? ' (you)' : ''}`}
              right={manage ? undefined : <Badge>{m.role}</Badge>}
            />
            {manage && (
              <>
                <Choice
                  label="Role"
                  value={m.role}
                  options={ROLE_OPTIONS}
                  onChange={(r) => void changeRole(m.membership_id, r)}
                />
                <Button
                  title="Remove"
                  variant="ghost"
                  onPress={() => void remove(m.membership_id)}
                />
              </>
            )}
          </Card>
        ))}
      </LoadState>
    </View>
  );
}
