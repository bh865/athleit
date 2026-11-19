'use client';

import {
  defaultPeopleView,
  friendlyError,
  parsePeopleView,
  TEAM_ROLES,
  teamTabHref,
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
import type { IconName } from '@athleit/ui-core';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { InvitePanel, type RoleOption } from '@/components/app/invite-panel';
import { FormMessage } from '@/components/app/states';
import { useTeam } from '@/components/app/team-context';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  Icon,
  IconButton,
  ListGroup,
  ListRow,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import { TeamCode, useCopy } from './overview';
import {
  ago,
  ConfirmSheet,
  ListState,
  matches,
  RowsSkeleton,
  SearchField,
  ShowMore,
  useShowMore,
} from './parts';
import { HeaderAction, useTeamHub } from './team-hub';
import styles from './team.module.css';

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

/** People: Members | Requests | Invites. The segment lives in the URL (?view=). */
export function PeopleTab() {
  const { team, caps } = useTeam();
  const hub = useTeamHub();
  const router = useRouter();
  const params = useSearchParams();
  const views = visiblePeopleViews(caps);
  const asked = parsePeopleView(params.get('view'));
  // Waiting for the request count only matters when nothing in the URL says where to open.
  const settling = !asked && hub.loading && views.includes('requests');
  const view: PeopleView =
    asked && views.includes(asked) ? asked : defaultPeopleView(hub.pendingRequests, views);
  const canInvite = caps.has('invites.createFamily');

  const options = views.map((v) => ({
    value: v,
    label:
      v === 'requests' && hub.pendingRequests > 0
        ? `Requests ${hub.pendingRequests}`
        : VIEW_LABEL[v],
  }));

  return (
    <div className={styles.stack}>
      {canInvite && view !== 'invites' ? (
        <HeaderAction>
          <ButtonLink href={teamTabHref(team.id, 'people', 'invites')}>
            <Icon name="user-plus" size="sm" /> Invite people
          </ButtonLink>
        </HeaderAction>
      ) : null}
      <SegmentedControl
        label="People"
        value={view}
        options={options}
        onChange={(v) => router.replace(teamTabHref(team.id, 'people', v))}
      />
      {settling ? (
        <RowsSkeleton label="Loading people" />
      ) : view === 'requests' ? (
        <RequestsView />
      ) : view === 'members' ? (
        <MembersView />
      ) : (
        <InvitesView />
      )}
    </div>
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
    const res = await decideJoinRequest(getClient(), id, approve);
    setBusy(null);
    if (res.error) setError(friendlyError(res.error));
    hub.reload();
  }

  return (
    <div className={styles.stack}>
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
            <Button onClick={() => void copy(team.join_code, 'Team code')}>
              <Icon name="share-network" size="sm" /> Share team code
            </Button>
          ),
        }}
      >
        <ListGroup data-testid="join-requests">
          {pending.map((r) => (
            <li key={r.id} className={styles.requestRow}>
              <Avatar name={r.requester_name} />
              <div className={styles.grow}>
                <strong>{r.requester_name}</strong>
                <p className={styles.muted}>
                  {r.player_first_name
                    ? `Parent of ${r.player_first_name} ${r.player_last_name}`
                    : 'Player, own login'}{' '}
                  · {ago(r.created_at)}
                </p>
                {r.message ? <p className={styles.quote}>“{r.message}”</p> : null}
              </div>
              <div className={styles.requestActions}>
                <Button loading={busy === r.id} onClick={() => void decide(r.id, true)}>
                  <Icon name="check" size="sm" /> Approve
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy === r.id}
                  onClick={() => void decide(r.id, false)}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ListGroup>
      </ListState>
    </div>
  );
}

function MembersView() {
  const { team, caps } = useTeam();
  const { userId } = useApp();
  const client = getClient();
  const list = useLoad(() => getTeamMembers(client, team.id), [team.id]);
  const [filter, setFilter] = useState<'all' | 'staff' | 'parent' | 'player'>('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const manage = caps.has('members.manage');
  const toast = useToast();

  const all = list.data ?? [];
  const count = (f: typeof filter) =>
    f === 'all'
      ? all.length
      : f === 'staff'
        ? all.filter((m) => STAFF_ROLES.includes(m.role)).length
        : all.filter((m) => m.role === f).length;
  const shownRows = all.filter(
    (m) =>
      (filter === 'all' ||
        (filter === 'staff' ? STAFF_ROLES.includes(m.role) : m.role === filter)) &&
      matches(q, m.display_name),
  );
  const page = useShowMore(shownRows, `${filter}|${q}`);
  const filters = (['all', 'staff', 'parent', 'player'] as const).filter(
    (f) => f === 'all' || count(f) > 0,
  );

  async function changeRole(id: string, role: (typeof TEAM_ROLES)[number]) {
    setError(null);
    const res = await setMemberRole(client, id, role);
    if (res.error) setError(friendlyError(res.error)); // e.g. the last admin cannot be demoted
    list.reload();
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    const res = await removeMember(client, removing.id);
    setBusy(false);
    if (res.error) setError(friendlyError(res.error));
    else toast(`${removing.name} removed`);
    setRemoving(null);
    list.reload();
  }

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
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
      </div>
      <FormMessage error={error} />
      <ListState
        name="members"
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        empty={{
          when: all.length === 0,
          icon: 'users-three',
          text: 'No members yet.',
        }}
      >
        {shownRows.length === 0 ? (
          <p className={styles.muted}>No one matches that search.</p>
        ) : (
          <ListGroup data-testid="members-list">
            {page.items.map((m) => (
              <li key={m.membership_id}>
                <ListRow
                  leading={<Avatar name={m.display_name} />}
                  title={
                    <>
                      {m.display_name}
                      {m.profile_id === userId ? <span className={styles.muted}> You</span> : null}
                    </>
                  }
                  trailing={
                    manage && m.profile_id !== userId ? (
                      <>
                        <select
                          className={styles.roleSelect}
                          aria-label={`Role for ${m.display_name}`}
                          value={m.role}
                          onChange={(e) =>
                            void changeRole(
                              m.membership_id,
                              e.target.value as (typeof TEAM_ROLES)[number],
                            )
                          }
                        >
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <IconButton
                          icon="user-minus"
                          label={`Remove ${m.display_name}`}
                          onClick={() => setRemoving({ id: m.membership_id, name: m.display_name })}
                        />
                      </>
                    ) : (
                      <span className={styles.rolePill}>
                        <Icon name={ROLE_ICON[m.role] ?? 'user'} size="sm" weight="fill" />
                        {cap(m.role)}
                      </span>
                    )
                  }
                />
              </li>
            ))}
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
    </div>
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
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // Staff (coach/manager/admin) join only by invite link, and only team admins can mint those.
  const roles = caps.has('invites.createStaff')
    ? [...STAFF_INVITE, ...FAMILY_INVITE]
    : FAMILY_INVITE;

  async function rotate() {
    setBusy(true);
    const res = await rotateJoinCode(getClient(), team.id);
    setBusy(false);
    setConfirm(false);
    if (res.error) return setError(friendlyError(res.error));
    toast('New team code generated');
    reload();
  }

  return (
    <div className={styles.stack}>
      <Card className={styles.stack}>
        <h2 className={styles.section}>Invite link</h2>
        <InvitePanel target={{ teamId: team.id }} roles={roles} />
      </Card>
      <Card className={styles.stack}>
        <h2 className={styles.section}>Team code</h2>
        <p className={styles.muted}>
          Families enter this code to request to join. You approve every request.
        </p>
        <TeamCode code={team.join_code}>
          {caps.has('team.rotateCode') ? (
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              <Icon name="arrow-clockwise" size="sm" /> Generate new code
            </Button>
          ) : null}
        </TeamCode>
        <FormMessage error={error} />
        {caps.has('team.rotateCode') ? (
          <p className={styles.muted}>The old code stops working right away.</p>
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
    </div>
  );
}
