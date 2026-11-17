import { friendlyError } from '@athleit/core';
import { decideJoinRequest, getJoinRequests } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, FormMessage, H2, ListItem, LoadState, Notice } from '@/components/app/kit';
import { Button, Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeam } from './team-context';

export function RequestsSection() {
  const { team, caps } = useTeam();
  const list = useLoad(() => getJoinRequests(supabase, team.id), [team.id]);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setError(null);
    const res = await decideJoinRequest(supabase, id, approve);
    if (res.error) setError(friendlyError(res.error));
    list.reload();
  }

  if (!caps.has('joinRequests.decide'))
    return <Notice>Only team staff can see join requests.</Notice>;
  return (
    <View style={{ gap: space[3] }}>
      <H2>Join requests</H2>
      <Text muted>
        Anyone with your team code can ask to join. They get access only after you approve.
      </Text>
      <FormMessage error={error} />
      <LoadState
        loading={list.loading}
        error={list.error}
        empty={list.data?.length === 0}
        emptyText="No requests yet. Share your team code or an invite link."
        onRetry={list.reload}
      >
        <View style={{ gap: space[3] }} testID="join-requests">
          {list.data?.map((r) => (
            <Card key={r.id} style={{ gap: space[2] }}>
              <ListItem
                title={r.requester_name}
                subtitle={`${r.player_first_name ? `For ${r.player_first_name} ${r.player_last_name}` : 'Parent or guardian'}${r.message ? ` · “${r.message}”` : ''}`}
                right={
                  r.status !== 'pending' ? (
                    <Badge tone={r.status === 'approved' ? 'success' : 'neutral'}>{r.status}</Badge>
                  ) : undefined
                }
              />
              {r.status === 'pending' && (
                <>
                  <Button title="Approve" onPress={() => void decide(r.id, true)} />
                  <Button
                    title="Decline"
                    variant="secondary"
                    onPress={() => void decide(r.id, false)}
                  />
                </>
              )}
            </Card>
          ))}
        </View>
      </LoadState>
    </View>
  );
}
