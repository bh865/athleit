import { previewOf, sumCents } from '@athleit/core';
import {
  getNotificationFailures,
  getRoster,
  getThreadList,
  listChildren,
  type Result,
} from '@athleit/db/api';
import {
  getCollectionSummary,
  getConnectedAccountStatus,
  getHouseholdPayments,
  listPaymentEvents,
  type Owner,
} from '@athleit/db/payments';
import { listDocuments } from '@athleit/db/registration';
import { getNextUp } from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ListItem } from '@/components/app/kit';
import { Amount, dueText } from '@/components/payments/money';
import { Badge, ListGroup, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

import { Tile } from './tiles';

/** Latest announcement (read counts are staff-only and not shown). */
export function AnnouncementTile({ teamId }: { teamId: string }) {
  const router = useRouter();
  const res = useLoad(() => getThreadList(supabase, teamId), [teamId]);
  const row = (res.data ?? []).find((t) => t.type === 'announcement' && t.last_body !== null);
  return (
    <Tile
      id="home-announcement"
      title="Latest announcement"
      res={res}
      hasData={res.data !== null}
      empty={!row}
    >
      {row ? (
        <ListGroup>
          <ListItem
            title={row.title ?? 'Announcement'}
            subtitle={previewOf({
              body: row.last_body ?? '',
              deleted: row.last_deleted,
              hidden: row.last_hidden,
            })}
            onPress={() => router.push(`/messages/${row.thread_id}` as never)}
          />
        </ListGroup>
      ) : null}
    </Tile>
  );
}

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

/** Families: what is due and when. Hidden when nothing is open. */
export function DueTile() {
  const router = useRouter();
  const res = useLoad(() => getHouseholdPayments(supabase), []);
  const due = (res.data ?? []).filter((r) => r.can_pay);
  const first = [...due].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  return (
    <Tile
      id="home-due"
      title="Amount due"
      res={res}
      hasData={res.data !== null}
      empty={due.length === 0}
    >
      {first ? (
        <ListGroup>
          <ListItem
            title={due.length === 1 ? first.title : `${due.length} payments due`}
            subtitle={`Due ${dueText(first.due_at)}`}
            right={<Amount cents={sumCents(due.map((r) => r.amount_cents))} />}
            onPress={() => router.push('/pay' as never)}
          />
        </ListGroup>
      ) : null}
    </Tile>
  );
}

/** Staff: outstanding across open requests, totals only. */
export function CollectionTile({ owner }: { owner: Owner }) {
  const router = useRouter();
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
  return (
    <Tile
      id="home-collection"
      title="Collection"
      res={res}
      hasData={d !== null}
      empty={!d || d.count === 0}
    >
      {d ? (
        <ListGroup>
          <ListItem
            title="Outstanding"
            subtitle={`${d.count} open request${d.count === 1 ? '' : 's'}`}
            right={<Amount cents={d.outstanding} variant="monoLg" label="Outstanding" />}
            onPress={() => router.push('/pay' as never)}
          />
        </ListGroup>
      ) : null}
    </Tile>
  );
}

/** Payout status: a dot with a word, never colour alone. */
export function PayoutsTile({ owner }: { owner: Owner }) {
  const res = useLoad(
    () => getConnectedAccountStatus(supabase, owner),
    [owner.teamId, owner.clubId],
  );
  const s = res.data;
  const ready = Boolean(s?.charges_enabled && s?.payouts_enabled);
  return (
    <Tile id="home-payouts" title="Payouts" res={res} hasData={!res.loading} empty={false}>
      <View>
        {ready ? (
          <Badge tone="success">Ready</Badge>
        ) : (
          <Badge tone="warning">{s?.exists_account ? 'Needs information' : 'Not set up'}</Badge>
        )}
      </View>
    </Tile>
  );
}

/** Admin only: failed notification deliveries. Hidden when none. */
export function NotificationHealthTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => getNotificationFailures(supabase, teamId), [teamId]);
  const n = (res.data ?? []).length;
  return (
    <Tile
      id="home-notification-health"
      title="Notification health"
      res={res}
      hasData={res.data !== null}
      empty={n === 0}
    >
      <Badge tone="danger">{`${n} failed ${n === 1 ? 'delivery' : 'deliveries'}`}</Badge>
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
