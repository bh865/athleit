import { teamTabParams } from '@athleit/core';
import { getRoster } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListGroup,
  Text,
  useToast,
} from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeamHub } from './hub';
import { AttentionRow, ListState, RowsSkeleton } from './parts';
import { useTeam } from './team-context';

export function useCopy() {
  const toast = useToast();
  return async (text: string, what: string) => {
    try {
      await Clipboard.setStringAsync(text);
      toast(`${what} copied`);
    } catch {
      toast(`Could not copy ${what.toLowerCase()}`, 'danger');
    }
  };
}

/** Team code with copy. Shown on Overview and on People · Invites. */
export function TeamCode({ code, children }: { code: string; children?: React.ReactNode }) {
  const copy = useCopy();
  return (
    <View style={{ gap: space[3] }}>
      <Text variant="monoLg" testID="join-code" selectable>
        {code}
      </Text>
      <Button
        title="Copy"
        icon="copy"
        variant="secondary"
        onPress={() => void copy(code, 'Team code')}
      />
      {children}
    </View>
  );
}

/** Overview: "Needs attention" hub, quick actions, roster snapshot. */
export function OverviewTab({ onOpen }: { onOpen: (p: ReturnType<typeof teamTabParams>) => void }) {
  const { team, caps } = useTeam();
  const hub = useTeamHub();
  const router = useRouter();
  const copy = useCopy();
  const roster = useLoad(() => getRoster(supabase, team.id), [team.id]);
  const rows = roster.data ?? [];
  const canInvite = caps.has('invites.createFamily');
  const invite = () => onOpen(teamTabParams('people', 'invites'));

  return (
    <View style={{ gap: space[4] }}>
      <Card style={{ gap: space[3] }}>
        {hub.loading ? (
          <RowsSkeleton />
        ) : hub.error ? (
          <ErrorState
            message="Can’t load what needs attention. Check your connection and try again."
            onRetry={hub.reload}
          />
        ) : hub.rows.length === 0 ? (
          <EmptyState
            icon="check"
            title="All caught up"
            body="No requests, waivers, registrations or payments need you right now."
            action={
              canInvite ? (
                <Button title="Invite people" icon="user-plus" onPress={invite} />
              ) : undefined
            }
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="heading">Needs attention</Text>
              <Text muted>
                {hub.rows.length} {hub.rows.length === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <ListGroup testID="team-attention">
              {hub.rows.map((r) => (
                <AttentionRow
                  key={r.kind}
                  row={r}
                  onOpen={() => onOpen(teamTabParams(r.tab, r.view))}
                />
              ))}
            </ListGroup>
          </>
        )}
      </Card>

      <Card style={{ gap: space[3] }}>
        <Text variant="heading">Quick actions</Text>
        {canInvite ? (
          <Button title="Invite people" icon="user-plus" variant="secondary" onPress={invite} />
        ) : null}
        <Button
          title="Share team code"
          icon="share-network"
          variant="secondary"
          onPress={() => void copy(team.join_code, 'Team code')}
        />
        <Text variant="caption" muted>
          Team code
        </Text>
        <TeamCode code={team.join_code} />
      </Card>

      <Card style={{ gap: space[3] }}>
        <Text variant="heading">Roster</Text>
        <ListState
          name="the roster"
          loading={roster.loading}
          error={roster.error}
          onRetry={roster.reload}
        >
          <Text muted testID="team-roster-count">
            {rows.length} {rows.length === 1 ? 'player' : 'players'} on the active roster
          </Text>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {rows.slice(0, 6).map((r) => (
              <Avatar key={`${r.first_name}-${r.jersey_number}`} name={r.first_name} size="sm" />
            ))}
          </View>
        </ListState>
        {caps.has('roster.viewLimited') ? (
          <Button
            title="Open Roster"
            icon="arrow-right"
            variant="secondary"
            onPress={() => router.push('/roster' as never)}
          />
        ) : null}
      </Card>
    </View>
  );
}
