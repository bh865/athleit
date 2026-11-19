import {
  agoLabel,
  defaultPeopleView,
  friendlyError,
  matchesQuery,
  TEAM_ROLES,
  visiblePeopleViews,
  type PeopleView,
} from '@athleit/core';
import {
  decideJoinRequest,
  getTeamMembers,
  removeMember,
  rotateJoinCode,
  setMemberRole,
} from '@athleit/db/api';
import { space } from '@athleit/tokens';
import type { IconName } from '@athleit/ui-core';
import { useState } from 'react';
import { View } from 'react-native';

import { InvitePanel, type RoleOption } from '@/components/app/invite-panel';
import { Choice, FormMessage } from '@/components/app/kit';
import {
  Avatar,
  Button,
  Card,
  Icon,
  ListGroup,
  ListRow,
  SegmentedControl,
  Text,
  useToast,
} from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { useTeamHub } from './hub';
import { TeamCode, useCopy } from './overview-tab';
import { ConfirmSheet, ListState, RowsSkeleton, SearchField, ShowMore, useShowMore } from './parts';
import { useTeam } from './team-context';

const VIEW_LABEL: Record<PeopleView, string> = {
  members: 'Members',
  requests: 'Requests',
  invites: 'Invites',
};
const STAFF_ROLES = ['admin', 'manager', 'coach'];
const ROLE_ICON: Record<string, IconName> = {
  admin: 'shield-star',
  manager: 'briefcase',
  coach: 'chalkboard-teacher',
  parent: 'user',
  player: 'user',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ROLE_OPTIONS = TEAM_ROLES.map((r) => ({ value: r, label: cap(r) }));

/** People: Members | Requests | Invites. Opens on Requests when any are pending. */
export function PeopleTab({
  view: asked,
  onView,
}: {
  view: PeopleView | null;
  onView: (v: PeopleView) => void;
}) {
  const { caps } = useTeam();
  const hub = useTeamHub();
  const views = visiblePeopleViews(caps);
  const settling = !asked && hub.loading && views.includes('requests');
  const view: PeopleView =
    asked && views.includes(asked) ? asked : defaultPeopleView(hub.pendingRequests, views);
  return (
    <View style={{ gap: space[4] }}>
      <SegmentedControl
        label="People"
        value={view}
        options={views.map((v) => ({
          value: v,
          label:
            v === 'requests' && hub.pendingRequests > 0
              ? `Requests ${hub.pendingRequests}`
              : VIEW_LABEL[v],
        }))}
        onChange={onView}
      />
      {settling ? (
        <RowsSkeleton />
      ) : view === 'requests' ? (
        <RequestsView />
      ) : view === 'members' ? (
        <MembersView />
      ) : (
        <InvitesView />
      )}
    </View>
  );
}

function RequestsView() {
  const { team } = useTeam();
  const hub = useTeamHub();
  const copy = useCopy();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = hub.joinRequests.filter((r) => r.status === 'pending');

  async function decide(id: string, approve: boolean) {
    setError(null);
    setBusy(id);
    const res = await decideJoinRequest(supabase, id, approve);
    setBusy(null);
    if (res.error) setError(friendlyError(res.error));
    hub.reload();
  }

  return (
    <View style={{ gap: space[3] }}>
      <FormMessage error={error} />
      <ListState
        name="join requests"
        loading={hub.loading}
        error={hub.error}
        onRetry={hub.reload}
        empty={{
          when: pending.length === 0,
          icon: 'user-plus',
          text: 'No join requests. Share the team code and new requests will show up here.',
          action: (
            <Button
              title="Share team code"
              icon="share-network"
              onPress={() => void copy(team.join_code, 'Team code')}
            />
          ),
        }}
      >
        <View style={{ gap: space[3] }} testID="join-requests">
          {pending.map((r) => (
            <Card key={r.id} style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
                <Avatar name={r.requester_name} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">{r.requester_name}</Text>
                  <Text variant="caption" muted>
                    {r.player_first_name
                      ? `Parent of ${r.player_first_name} ${r.player_last_name}`
                      : 'Player, own login'}{' '}
                    · {agoLabel(r.created_at)}
                  </Text>
                </View>
              </View>
              {r.message ? (
                <Text variant="caption" muted>
                  “{r.message}”
                </Text>
              ) : null}
              <Button
                title="Approve"
                icon="check"
                loading={busy === r.id}
                onPress={() => void decide(r.id, true)}
              />
              <Button
                title="Decline"
                variant="secondary"
                disabled={busy === r.id}
                onPress={() => void decide(r.id, false)}
              />
            </Card>
          ))}
        </View>
      </ListState>
    </View>
  );
}

function MembersView() {
  const { team, caps } = useTeam();
  const { userId } = useApp();
  const toast = useToast();
  const list = useLoad(() => getTeamMembers(supabase, team.id), [team.id]);
  const [filter, setFilter] = useState<'all' | 'staff' | 'parent' | 'player'>('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const manage = caps.has('members.manage');

  const all = list.data ?? [];
  const count = (f: typeof filter) =>
    f === 'all'
      ? all.length
      : f === 'staff'
        ? all.filter((m) => STAFF_ROLES.includes(m.role)).length
        : all.filter((m) => m.role === f).length;
  const rows = all.filter(
    (m) =>
      (filter === 'all' ||
        (filter === 'staff' ? STAFF_ROLES.includes(m.role) : m.role === filter)) &&
      matchesQuery(q, m.display_name),
  );
  const page = useShowMore(rows, `${filter}|${q}`);
  const filters = (['all', 'staff', 'parent', 'player'] as const).filter(
    (f) => f === 'all' || count(f) > 0,
  );

  async function changeRole(id: string, role: (typeof TEAM_ROLES)[number]) {
    setError(null);
    const res = await setMemberRole(supabase, id, role);
    if (res.error) setError(friendlyError(res.error)); // e.g. the last admin cannot be demoted
    setEditing(null);
    list.reload();
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    const res = await removeMember(supabase, removing.id);
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else toast(`${removing.name} removed`);
    setRemoving(null);
    list.reload();
  }

  return (
    <View style={{ gap: space[3] }}>
      <SegmentedControl
        label="Filter members"
        value={filter}
        options={filters.map((f) => ({
          value: f,
          label: `${f === 'all' ? 'All' : f === 'staff' ? 'Staff' : f === 'parent' ? 'Parents' : 'Players'} ${count(f)}`,
        }))}
        onChange={setFilter}
      />
      <SearchField label="Search members" value={q} onChange={setQ} />
      <FormMessage error={error} />
      <ListState
        name="members"
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        empty={{ when: all.length === 0, icon: 'users-three', text: 'No members yet.' }}
      >
        {rows.length === 0 ? (
          <Text muted>No one matches that search.</Text>
        ) : (
          <ListGroup testID="members-list">
            {page.items.map((m, i) => {
              const self = m.profile_id === userId;
              return (
                <View key={m.membership_id}>
                  <ListRow
                    last={i === page.items.length - 1 && editing !== m.membership_id}
                    leading={<Avatar name={m.display_name} />}
                    title={`${m.display_name}${self ? ' (you)' : ''}`}
                    {...(manage && !self
                      ? {
                          onPress: () =>
                            setEditing(editing === m.membership_id ? null : m.membership_id),
                        }
                      : {})}
                    trailing={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
                        <Icon name={ROLE_ICON[m.role] ?? 'user'} size="sm" weight="fill" />
                        <Text variant="caption">{cap(m.role)}</Text>
                      </View>
                    }
                  />
                  {editing === m.membership_id ? (
                    <View style={{ gap: space[3], paddingBottom: space[3] }}>
                      <Choice
                        label="Role"
                        value={m.role}
                        options={ROLE_OPTIONS}
                        onChange={(r) => void changeRole(m.membership_id, r)}
                      />
                      <Button
                        title={`Remove ${m.display_name}`}
                        icon="user-minus"
                        variant="ghost"
                        onPress={() => setRemoving({ id: m.membership_id, name: m.display_name })}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ListGroup>
        )}
        <ShowMore
          total={page.total}
          shown={page.items.length}
          remaining={page.remaining}
          onMore={page.more}
        />
      </ListState>
      <ConfirmSheet
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        body="They lose access to this team right away. You can invite them again later."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </View>
  );
}

const STAFF_INVITE: RoleOption[] = [
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];
const FAMILY_INVITE: RoleOption[] = [{ value: 'parent', label: 'Parent' }];

function InvitesView() {
  const { team, caps, reload } = useTeam();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roles = caps.has('invites.createStaff')
    ? [...STAFF_INVITE, ...FAMILY_INVITE]
    : FAMILY_INVITE;

  async function rotate() {
    setBusy(true);
    const res = await rotateJoinCode(supabase, team.id);
    setBusy(false);
    setConfirm(false);
    if (res.error) return setError(friendlyError(res.error));
    toast('New team code generated');
    reload();
  }

  return (
    <View style={{ gap: space[4] }}>
      <Card style={{ gap: space[3] }}>
        <Text variant="heading">Invite link</Text>
        <InvitePanel target={{ teamId: team.id }} roles={roles} />
      </Card>
      <Card style={{ gap: space[3] }}>
        <Text variant="heading">Team code</Text>
        <Text muted>Families enter this code to request to join. You approve every request.</Text>
        <TeamCode code={team.join_code}>
          {caps.has('team.rotateCode') ? (
            <Button
              title="Generate new code"
              icon="arrow-clockwise"
              variant="secondary"
              onPress={() => setConfirm(true)}
            />
          ) : null}
        </TeamCode>
        <FormMessage error={error} />
        {caps.has('team.rotateCode') ? (
          <Text variant="caption" muted>
            The old code stops working right away.
          </Text>
        ) : null}
      </Card>
      <ConfirmSheet
        open={confirm}
        title="Generate a new team code?"
        body="The old code stops working right away. Anyone who has it will need the new one."
        confirmLabel="Generate new code"
        busy={busy}
        onConfirm={() => void rotate()}
        onClose={() => setConfirm(false)}
      />
    </View>
  );
}
