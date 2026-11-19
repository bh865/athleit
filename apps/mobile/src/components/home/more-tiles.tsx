import { formatCents, sumCents } from '@athleit/core';
import { getJoinRequests, getRoster, listChildren, type Result } from '@athleit/db/api';
import {
  getCollectionSummary,
  getHouseholdPayments,
  listPaymentEvents,
  type Owner,
} from '@athleit/db/payments';
import { listDocuments } from '@athleit/db/registration';
import { getNextUp } from '@athleit/db/scheduling';
import { radius, space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ListItem } from '@/components/app/kit';
import { Amount, dueText } from '@/components/payments/money';
import { Avatar, Badge, Button, ListGroup, Text, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Stat, Tile } from './tiles';

/** Pinned or recent documents; read-only here. */
export function DocumentsTile({ teamId }: { teamId: string }) {
  const router = useRouter();
  const res = useLoad(() => listDocuments(supabase, { teamId }), [teamId]);
  const docs = [...(res.data ?? [])]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .slice(0, 3);
  return (
    <Tile
      id="home-documents"
      title="Documents"
      res={res}
      hasData={res.data !== null}
      empty={docs.length === 0}
    >
      <ListGroup>
        {docs.map((d) => (
          <ListItem
            key={d.id}
            title={d.title}
            onPress={() => router.push(`/teams/${teamId}` as never)}
          />
        ))}
      </ListGroup>
    </Tile>
  );
}

/** My children: first names and their teams. */
export function FamilyTile() {
  const router = useRouter();
  const res = useLoad(() => listChildren(supabase), []);
  const kids = res.data ?? [];
  return (
    <Tile
      id="home-family"
      title="My children"
      res={res}
      hasData={res.data !== null}
      empty={kids.length === 0}
    >
      <ListGroup>
        {kids.slice(0, 4).map((k) => (
          <ListItem
            key={k.id}
            title={k.first_name}
            subtitle={
              (k.team_players ?? [])
                .map((tp) => tp.teams?.name)
                .filter(Boolean)
                .join(', ') || 'Not on a team yet'
            }
            avatarName={k.first_name}
            onPress={() => router.push(`/family/children/${k.id}` as never)}
          />
        ))}
      </ListGroup>
    </Tile>
  );
}

/** Families: big mono total, what it is for and when, one Pay button. Hidden when nothing is due. */
export function DueTile() {
  const router = useRouter();
  const res = useLoad(() => getHouseholdPayments(supabase), []);
  const due = (res.data ?? []).filter((r) => r.can_pay);
  const first = [...due].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  const total = sumCents(due.map((r) => r.amount_cents));
  return (
    <Tile id="home-due" title="Amount due" res={res} hasData={res.data !== null} empty={!first}>
      {first ? (
        <View style={{ gap: space[2], alignItems: 'flex-start' }}>
          <Badge>{`${due.length} request${due.length === 1 ? '' : 's'}`}</Badge>
          <Amount cents={total} variant="monoXl" label="Amount due" />
          <Text variant="caption" muted>
            {due.length === 1
              ? `${first.title}${first.player_first_name ? ` · ${first.player_first_name}` : ''}`
              : `${due.length} payments`}
            {' · due '}
            {dueText(first.due_at)}
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              title={`Pay ${formatCents(total)}`}
              onPress={() => router.push('/pay' as never)}
            />
          </View>
        </View>
      ) : null}
    </Tile>
  );
}

/** Staff: what is still owed across open requests, styled like Amount due. Hidden when nothing is open. */
export function OutstandingTile({ owner }: { owner: Owner }) {
  const router = useRouter();
  const { theme } = useTheme();
  const res = useLoad(async (): Promise<
    Result<{ outstanding: number; collected: number; expected: number; count: number }>
  > => {
    const events = await listPaymentEvents(supabase, owner);
    if (events.error) return events;
    const open = events.data.filter((e) => e.status === 'published').slice(0, 10);
    const sums = await Promise.all(open.map((e) => getCollectionSummary(supabase, e.id)));
    const rows = sums.flatMap((s) => (s.data ? [s.data] : []));
    return {
      data: {
        outstanding: sumCents(rows.map((r) => Number(r.outstanding_cents))),
        collected: sumCents(rows.map((r) => Number(r.collected_cents))),
        expected: sumCents(rows.map((r) => Number(r.expected_cents))),
        count: open.length,
      },
      error: null,
    };
  }, [owner.teamId, owner.clubId]);
  const d = res.data;
  const pct = d && d.expected > 0 ? Math.min(100, Math.floor((d.collected * 100) / d.expected)) : 0;
  return (
    <Tile
      id="home-payments"
      title="Outstanding payments"
      res={res}
      hasData={d !== null}
      empty={!d || d.count === 0}
    >
      {d ? (
        <View style={{ gap: space[2], alignItems: 'flex-start' }}>
          <Badge>{`${d.count} open request${d.count === 1 ? '' : 's'}`}</Badge>
          <Amount cents={d.outstanding} variant="monoXl" label="Outstanding" />
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Collected"
            accessibilityValue={{ min: 0, max: 100, now: pct }}
            style={{
              alignSelf: 'stretch',
              height: space[2],
              borderRadius: radius.pill,
              overflow: 'hidden',
              backgroundColor: theme.color.surfaceAlt,
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: radius.pill,
                backgroundColor: theme.color.accent,
              }}
            />
          </View>
          <Text variant="caption" muted>
            {pct}% collected
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              title="View payments"
              variant="secondary"
              onPress={() => router.push('/pay' as never)}
            />
          </View>
        </View>
      ) : null}
    </Tile>
  );
}

/** Players, and for staff active and pending counts, with an avatar stack. */
export function RosterTile({ teamId, staff }: { teamId: string; staff: boolean }) {
  const router = useRouter();
  const roster = useLoad(() => getRoster(supabase, teamId), [teamId]);
  const pending = useLoad(
    () =>
      staff
        ? getJoinRequests(supabase, teamId)
        : Promise.resolve({ data: [] as { status: string }[], error: null }),
    [teamId, staff],
  );
  const rows = (roster.data ?? []) as { first_name: string; status?: string }[];
  const active = rows.filter((r) => r.status === undefined || r.status === 'active');
  const waiting = (pending.data ?? []).filter((r) => r.status === 'pending').length;
  return (
    <Tile id="home-roster" title="Roster" res={roster} hasData={roster.data !== null} empty={false}>
      <View style={{ flexDirection: 'row', gap: space[6] }}>
        <Stat v={rows.length} l="Players" />
        {staff ? (
          <>
            <Stat v={active.length} l="Active" />
            <Stat v={waiting} l="Pending" />
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }} accessibilityElementsHidden>
        {rows.slice(0, 5).map((r, i) => (
          <View key={`${r.first_name}${i}`} style={{ marginLeft: i === 0 ? 0 : -space[2] }}>
            <Avatar name={r.first_name} size="sm" />
          </View>
        ))}
      </View>
      <Button
        title="Open roster"
        variant="secondary"
        onPress={() => router.push('/roster' as never)}
      />
    </Tile>
  );
}

/** New-team checklist for admins and managers; disappears once players and an event exist. */
export function SetupTile({ teamId }: { teamId: string }) {
  const router = useRouter();
  const res = useLoad(async (): Promise<Result<{ players: number; events: number }>> => {
    const [r, n] = await Promise.all([getRoster(supabase, teamId), getNextUp(supabase, 20)]);
    if (r.error) return r;
    if (n.error) return n;
    return {
      data: { players: r.data.length, events: n.data.filter((e) => e.team_id === teamId).length },
      error: null,
    };
  }, [teamId]);
  const d = res.data;
  const steps = [
    { done: (d?.players ?? 0) > 0, label: 'Add your first player', href: '/roster' },
    { done: (d?.events ?? 0) > 0, label: 'Schedule your first event', href: '/schedule' },
  ].filter((s) => !s.done);
  return (
    <Tile
      id="home-setup"
      title="Set up your team"
      res={res}
      hasData={d !== null}
      empty={steps.length === 0}
    >
      <ListGroup>
        {steps.map((s) => (
          <ListItem key={s.label} title={s.label} onPress={() => router.push(s.href as never)} />
        ))}
      </ListGroup>
    </Tile>
  );
}

/** Group heading with a scope line ("U12 Falcons · Admin"). */
export function GroupHead({ label, scope }: { label: string; scope?: string }) {
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="label" muted accessibilityRole="header">
        {label.toUpperCase()}
      </Text>
      {scope ? (
        <Text variant="caption" muted>
          {scope}
        </Text>
      ) : null}
    </View>
  );
}
