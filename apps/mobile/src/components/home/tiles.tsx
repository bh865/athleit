import { describeEventTime } from '@athleit/core';
import { getJoinRequests, type Result } from '@athleit/db/api';
import {
  getCapacitySummary,
  getWaiverCompliance,
  listMyRegistrations,
  listRegistrationEvents,
} from '@athleit/db/registration';
import {
  getHouseholdScheduleRange,
  getTeamRecord,
  getTeamScheduleRange,
} from '@athleit/db/scheduling';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ListItem } from '@/components/app/kit';
import { Badge, Card, ErrorState, ListGroup, LoadingSkeleton, Mono, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { viewerZone } from '@/lib/viewer-zone';

const DAY = 24 * 60 * 60 * 1000;
const RSVP_LABEL: Record<string, string> = {
  going: 'Going',
  not_going: 'Can’t go',
  maybe: 'Maybe',
};

interface LoadResult {
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Skeleton while loading, retryable error, nothing at all when empty. One tile failing never blanks Home. */
export function Tile({
  id,
  title,
  res,
  hasData,
  empty,
  children,
}: {
  id: string;
  title: string;
  res: LoadResult;
  hasData: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  if (res.error)
    return (
      <Card testID={id} style={{ gap: space[3] }}>
        <Text variant="bodyBold" accessibilityRole="header">
          {title}
        </Text>
        <ErrorState message="Couldn’t load this." onRetry={res.reload} />
      </Card>
    );
  if (res.loading && !hasData)
    return (
      <Card testID={id} style={{ gap: space[3] }}>
        <Text variant="bodyBold" accessibilityRole="header">
          {title}
        </Text>
        <LoadingSkeleton rows={2} />
      </Card>
    );
  if (empty) return null;
  return (
    <Card testID={id} style={{ gap: space[3] }}>
      <Text variant="bodyBold" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </Card>
  );
}

export function Stat({ v, l }: { v: number; l: string }) {
  return (
    <View accessibilityLabel={`${v} ${l}`}>
      <Mono>{v}</Mono>
      <Text variant="caption" muted>
        {l}
      </Text>
    </View>
  );
}

interface WeekRow {
  key: string;
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  meta: string;
}

/** The next 7 days: staff see RSVP counts; families see each child's RSVP ("Maya: Going"). */
export function WeekTile({ teamId, staff }: { teamId: string | null; staff: boolean }) {
  const router = useRouter();
  const res = useLoad(async (): Promise<Result<WeekRow[]>> => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * DAY);
    if (staff && teamId) {
      const r = await getTeamScheduleRange(supabase, teamId, from.toISOString(), to.toISOString());
      if (r.error) return r;
      return {
        data: r.data.map((e) => ({
          key: e.id,
          id: e.id,
          title: e.title,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          timezone: e.timezone,
          meta:
            e.status === 'cancelled' ? 'Cancelled' : `${e.going} going · ${e.no_reply} no reply`,
        })),
        error: null,
      };
    }
    const r = await getHouseholdScheduleRange(supabase, from.toISOString(), to.toISOString());
    if (r.error) return r;
    return {
      data: r.data.map((e) => ({
        key: `${e.event_id}:${e.player_id}`,
        id: e.event_id,
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        timezone: e.timezone,
        meta: `${e.player_first_name}: ${
          e.status === 'cancelled'
            ? 'Cancelled'
            : e.rsvp_status
              ? (RSVP_LABEL[e.rsvp_status] ?? e.rsvp_status)
              : 'No reply'
        }`,
      })),
      error: null,
    };
  }, [teamId, staff]);
  const rows = (res.data ?? []).slice(0, 5);
  return (
    <Tile
      id="home-week"
      title="This week"
      res={res}
      hasData={res.data !== null}
      empty={rows.length === 0}
    >
      <ListGroup>
        {rows.map((e) => {
          const t = describeEventTime(e.starts_at, e.ends_at, e.timezone, viewerZone());
          return (
            <ListItem
              key={e.key}
              title={`${t.weekdayShort} ${t.startLabel} · ${e.title}`}
              subtitle={e.meta}
              onPress={() => router.push(`/events/${e.id}` as never)}
            />
          );
        })}
      </ListGroup>
    </Tile>
  );
}

/** Season record. Hidden until a game has been played. */
export function RecordTile({ teamId }: { teamId: string }) {
  const res = useLoad(() => getTeamRecord(supabase, teamId), [teamId]);
  const r = res.data;
  return (
    <Tile
      id="home-record"
      title="Team record"
      res={res}
      hasData={r !== null}
      empty={!r || r.games === 0}
    >
      {r ? (
        <>
          <View style={{ flexDirection: 'row', gap: space[6] }}>
            <Stat v={r.wins} l="Wins" />
            <Stat v={r.losses} l="Losses" />
            <Stat v={r.ties} l="Ties" />
          </View>
          <Text variant="caption" muted>
            {r.season_label}
          </Text>
        </>
      ) : null}
    </Tile>
  );
}

interface WaiverView {
  mode: 'staff' | 'family';
  signed: number;
  open: { name: string; status: string }[];
  own: { name: string; event: string }[];
}

/** Status and first names only; never signed text or medical answers. */
export function WaiversTile({
  teamId,
  staff,
  family,
}: {
  teamId: string | null;
  staff: boolean;
  family: boolean;
}) {
  const router = useRouter();
  const res = useLoad(async (): Promise<Result<WaiverView | null>> => {
    if (staff && teamId) {
      const r = await getWaiverCompliance(supabase, teamId);
      if (r.error) return r;
      return {
        data: {
          mode: 'staff',
          signed: r.data.filter((w) => w.status === 'signed').length,
          open: r.data
            .filter((w) => w.status !== 'signed')
            .map((w) => ({ name: w.first_name, status: w.status })),
          own: [],
        },
        error: null,
      };
    }
    if (family) {
      const r = await listMyRegistrations(supabase);
      if (r.error) return r;
      return {
        data: {
          mode: 'family',
          signed: 0,
          open: [],
          own: r.data
            .filter((x) => x.next_step === 'sign_waivers')
            .map((x) => ({ name: x.player_first_name ?? 'Player', event: x.event_title })),
        },
        error: null,
      };
    }
    return { data: null, error: null };
  }, [teamId, staff, family]);
  const d = res.data;
  const empty = !d || (d.mode === 'staff' ? d.open.length === 0 : d.own.length === 0);
  return (
    <Tile id="home-waivers" title="Waivers" res={res} hasData={d !== null} empty={empty}>
      {d?.mode === 'staff' ? (
        <>
          <View style={{ flexDirection: 'row', gap: space[6] }}>
            <Stat v={d.signed} l="Signed" />
            <Stat v={d.open.length} l="Missing" />
          </View>
          {d.open.slice(0, 4).map((w, i) => (
            <Badge key={`${w.name}${i}`} tone={w.status === 'expired' ? 'warning' : 'danger'}>
              {w.name} · {w.status === 'expired' ? 'Expired' : 'Missing'}
            </Badge>
          ))}
        </>
      ) : (
        <ListGroup>
          {d?.own.map((o, i) => (
            <ListItem
              key={`${o.name}${i}`}
              title={`Sign ${o.name}’s waiver`}
              subtitle={o.event}
              onPress={() => router.push('/registrations' as never)}
            />
          ))}
        </ListGroup>
      )}
    </Tile>
  );
}

/** Pending join requests the person can decide. */
export function ApprovalsTile({ teamId }: { teamId: string }) {
  const router = useRouter();
  const res = useLoad(() => getJoinRequests(supabase, teamId), [teamId]);
  const pending = (res.data ?? []).filter((r) => r.status === 'pending');
  return (
    <Tile
      id="home-approvals"
      title={`Join requests${pending.length ? ` · ${pending.length}` : ''}`}
      res={res}
      hasData={res.data !== null}
      empty={pending.length === 0}
    >
      <ListGroup>
        {pending.slice(0, 3).map((r) => (
          <ListItem
            key={r.id}
            title={r.requester_name}
            subtitle={`Parent of ${r.player_first_name}`}
            onPress={() => router.push(`/teams/${teamId}/requests` as never)}
          />
        ))}
      </ListGroup>
    </Tile>
  );
}

interface RegView {
  rows: { id: string; title: string; line: string }[];
}

/** Staff see capacity across open events; families see their own status. */
export function RegistrationsTile({ teamId, staff }: { teamId: string | null; staff: boolean }) {
  const router = useRouter();
  const res = useLoad(async (): Promise<Result<RegView>> => {
    if (staff && teamId) {
      const events = await listRegistrationEvents(supabase, { teamId });
      if (events.error) return events;
      const open = events.data.filter((e) => e.status === 'open').slice(0, 5);
      const sums = await Promise.all(open.map((e) => getCapacitySummary(supabase, e.id)));
      return {
        data: {
          rows: open.map((e, i) => ({
            id: e.id,
            title: e.title,
            line: sums[i]?.data
              ? `${sums[i]!.data!.submitted} submitted · ${sums[i]!.data!.accepted} accepted`
              : 'Open',
          })),
        },
        error: null,
      };
    }
    const mine = await listMyRegistrations(supabase);
    if (mine.error) return mine;
    return {
      data: {
        rows: mine.data.slice(0, 3).map((r) => ({
          id: r.id,
          title: r.event_title,
          line: `${r.player_first_name ?? 'Player'} · ${r.status}`,
        })),
      },
      error: null,
    };
  }, [teamId, staff]);
  const rows = res.data?.rows ?? [];
  return (
    <Tile
      id="home-registrations"
      title="Registrations"
      res={res}
      hasData={res.data !== null}
      empty={rows.length === 0}
    >
      <ListGroup>
        {rows.map((r) => (
          <ListItem
            key={r.id}
            title={r.title}
            subtitle={r.line}
            onPress={() => router.push('/registrations' as never)}
          />
        ))}
      </ListGroup>
    </Tile>
  );
}
