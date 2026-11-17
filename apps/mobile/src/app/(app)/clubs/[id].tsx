import { capabilitiesForPlace, friendlyError } from '@athleit/core';
import {
  decideClubLink,
  getClub,
  getClubTeams,
  getLinkRequests,
  unlinkTeamFromClub,
} from '@athleit/db/api';
import { spacing } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { InvitePanel } from '@/components/app/invite-panel';
import { Badge, FormMessage, H1, H2, ListItem, LoadState } from '@/components/app/kit';
import { Button, Card, Text } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contexts } = useApp();
  const router = useRouter();
  const caps = capabilitiesForPlace(contexts, 'club', id);
  const admin = caps.has('club.decideLink');
  const club = useLoad(() => getClub(supabase, id), [id]);
  const teams = useLoad(() => getClubTeams(supabase, id), [id]);
  const links = useLoad(
    () =>
      admin
        ? getLinkRequests(supabase, { clubId: id })
        : Promise.resolve({ data: [], error: null }),
    [id],
  );
  const [error, setError] = useState<string | null>(null);
  const pending = (links.data ?? []).filter((l) => l.status === 'pending');

  async function decide(requestId: string, approve: boolean) {
    setError(null);
    const res = await decideClubLink(supabase, requestId, approve);
    if (res.error) setError(friendlyError(res.error));
    links.reload();
    teams.reload();
  }
  async function unlink(teamId: string) {
    setError(null);
    const res = await unlinkTeamFromClub(supabase, teamId);
    if (res.error) setError(friendlyError(res.error));
    teams.reload();
  }

  return (
    <AppScreen>
      <LoadState
        loading={club.loading}
        error={club.error ? 'We couldn’t open this club.' : null}
        onRetry={club.reload}
      >
        {club.data && (
          <>
            <View style={{ gap: spacing[1] }}>
              <H1>{club.data.name}</H1>
              <Text muted mono>
                {club.data.slug}
              </Text>
            </View>
            <FormMessage error={error} />
            {admin && (
              <View style={{ gap: spacing[3] }}>
                <H2>Team requests</H2>
                <LoadState
                  loading={links.loading}
                  error={links.error}
                  empty={pending.length === 0}
                  emptyText="No teams are waiting for approval."
                  onRetry={links.reload}
                >
                  <View style={{ gap: spacing[3] }} testID="link-requests">
                    {pending.map((l) => (
                      <Card key={l.id} style={{ gap: spacing[2] }}>
                        <ListItem
                          title={l.team_name}
                          subtitle={`${l.sport} · ${l.season_label} · asked by ${l.requested_by_name}`}
                        />
                        <Button title="Approve" onPress={() => void decide(l.id, true)} />
                        <Button
                          title="Decline"
                          variant="secondary"
                          onPress={() => void decide(l.id, false)}
                        />
                      </Card>
                    ))}
                  </View>
                </LoadState>
              </View>
            )}
            <View style={{ gap: spacing[3] }}>
              <H2>Teams</H2>
              <LoadState
                loading={teams.loading}
                error={teams.error}
                empty={teams.data?.length === 0}
                emptyText="No teams yet. Teams ask to join from their settings, using this club’s web address."
                onRetry={teams.reload}
              >
                {teams.data?.map((t) => (
                  <View key={t.id} style={{ gap: spacing[1] }}>
                    <ListItem
                      title={t.name}
                      subtitle={`${t.sport} · ${t.season_label}`}
                      right={<Badge>{t.sport}</Badge>}
                      onPress={() => router.push(`/teams/${t.id}`)}
                    />
                    {caps.has('club.unlinkTeam') && (
                      <Button
                        title={`Unlink ${t.name}`}
                        variant="ghost"
                        onPress={() => void unlink(t.id)}
                      />
                    )}
                  </View>
                ))}
              </LoadState>
            </View>
            {caps.has('club.invite') && (
              <Card style={{ gap: spacing[3] }}>
                <H2>Invite club staff</H2>
                <InvitePanel
                  target={{ clubId: id }}
                  roles={[
                    { value: 'manager', label: 'Manager' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                />
              </Card>
            )}
          </>
        )}
      </LoadState>
    </AppScreen>
  );
}
