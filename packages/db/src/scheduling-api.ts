import type { PostgrestError } from '@supabase/supabase-js';

import type { Client, Result } from './api';
import type { Database, Tables } from './database.types';

/**
 * Typed data access for Phase 2 (scheduling, RSVP, results). Writes are database functions;
 * reads use the read helpers or RLS-protected tables. Nothing here decides permissions.
 */
type Fn = Database['public']['Functions'];
export type TeamScheduleRow = Fn['team_schedule']['Returns'][number];
export type HouseholdScheduleRow = Fn['household_schedule']['Returns'][number];
export type NextUpRow = Fn['next_up']['Returns'][number];
export type EventDetail = Fn['get_event']['Returns'][number];
export type RsvpSummary = Fn['event_rsvp_summary']['Returns'][number];
export type RsvpDetailRow = Fn['event_rsvp_detail']['Returns'][number];
export type TeamRecord = Fn['team_record']['Returns'][number];
export type SportConfigRow = Tables<'sport_configs'>;
export type LocationRow = Tables<'locations'>;
export type OpponentRow = Tables<'opponents'>;

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(e: PostgrestError | { message: string } | null): Result<T> => ({
  data: null,
  error: {
    message: e?.message ?? 'Unknown error',
    code: e && 'code' in e ? e.code : undefined,
    details: e && 'details' in e ? e.details : undefined,
  },
});

// Several arguments accept NULL but are typed non-null in the generated types.
type Loose = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: PostgrestError | null;
}>;
const call =
  (client: Client): Loose =>
  (fn, args) =>
    (client.rpc as unknown as Loose).call(client, fn, args);

async function rows<T>(
  q: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<Result<T[]>> {
  const { data, error } = await q;
  return error ? fail(error) : ok((data ?? []) as T[]);
}
async function one<T>(
  q: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<Result<T | null>> {
  const { data, error } = await q;
  return error ? fail(error) : ok(((data as T[] | null) ?? [])[0] ?? null);
}
async function scalar<T>(
  q: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<Result<T>> {
  const { data, error } = await q;
  return error ? fail(error) : ok(data as T);
}

// Reads ------------------------------------------------------------------------------------------
export const getSportConfigs = (client: Client) =>
  rows<SportConfigRow>(client.from('sport_configs').select('*'));

export const getTeamSchedule = (
  client: Client,
  teamId: string,
  when: 'upcoming' | 'past',
  limit = 25,
  offset = 0,
) =>
  rows<TeamScheduleRow>(
    call(client)('team_schedule', {
      p_team_id: teamId,
      p_when: when,
      p_limit: limit,
      p_offset: offset,
    }),
  );

export const getTeamScheduleRange = (client: Client, teamId: string, from: string, to: string) =>
  rows<TeamScheduleRow>(
    call(client)('team_schedule_range', { p_team_id: teamId, p_from: from, p_to: to }),
  );

export const getHouseholdSchedule = (
  client: Client,
  when: 'upcoming' | 'past',
  limit = 50,
  offset = 0,
) =>
  rows<HouseholdScheduleRow>(
    call(client)('household_schedule', { p_when: when, p_limit: limit, p_offset: offset }),
  );

export const getHouseholdScheduleRange = (client: Client, from: string, to: string) =>
  rows<HouseholdScheduleRow>(call(client)('household_schedule_range', { p_from: from, p_to: to }));

export const getNextUp = (client: Client, limit = 5) =>
  rows<NextUpRow>(call(client)('next_up', { p_limit: limit }));

export const getEvent = (client: Client, eventId: string) =>
  one<EventDetail>(call(client)('get_event', { p_event_id: eventId }));

export const getRsvpSummary = (client: Client, eventId: string) =>
  one<RsvpSummary>(call(client)('event_rsvp_summary', { p_event_id: eventId }));

/** Staff only; the database raises `forbidden` for anyone else. */
export const getRsvpDetail = (client: Client, eventId: string) =>
  rows<RsvpDetailRow>(call(client)('event_rsvp_detail', { p_event_id: eventId }));

export const getTeamRecord = (client: Client, teamId: string) =>
  one<TeamRecord>(call(client)('team_record', { p_team_id: teamId }));

/** The viewer's own children's RSVPs for one event (RLS limits the rows to them). */
export const getMyRsvps = (client: Client, eventId: string) =>
  rows<Tables<'rsvps'>>(client.from('rsvps').select('*').eq('event_id', eventId));

export const getLocations = (client: Client, teamId: string) =>
  rows<LocationRow>(client.from('locations').select('*').eq('team_id', teamId).order('name'));
export const getOpponents = (client: Client, teamId: string) =>
  rows<OpponentRow>(client.from('opponents').select('*').eq('team_id', teamId).order('name'));

// Writes (functions) ---------------------------------------------------------------------------
export interface CreateEventArgs {
  team_id: string;
  type: 'game' | 'practice' | 'event';
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_id?: string | null;
  location_text?: string | null;
  opponent_id?: string | null;
  home_away?: 'home' | 'away' | 'neutral' | null;
  notes?: string | null;
  arrive_early_minutes?: number | null;
  game_format?: { period_count?: number; period_minutes?: number | null } | null;
  recurrence?: { weekdays: number[]; interval?: number; until?: string; count?: number } | null;
}

export const createEvent = (client: Client, a: CreateEventArgs) =>
  one<{ event_id: string; series_id: string | null; occurrences: number }>(
    call(client)('create_event', {
      p_team_id: a.team_id,
      p_type: a.type,
      p_title: a.title,
      p_starts_at: a.starts_at,
      p_ends_at: a.ends_at,
      p_timezone: a.timezone,
      p_location_id: a.location_id ?? null,
      p_location_text: a.location_text ?? null,
      p_opponent_id: a.opponent_id ?? null,
      p_home_away: a.home_away ?? null,
      p_notes: a.notes ?? null,
      p_arrive_early_minutes: a.arrive_early_minutes ?? null,
      p_game_format: a.game_format ?? null,
      p_recurrence: a.recurrence ?? null,
    }),
  );

export const updateEvent = (
  client: Client,
  eventId: string,
  scope: 'this' | 'this_and_following' | 'all',
  patch: Record<string, unknown>,
) =>
  scalar<number>(
    call(client)('update_event', { p_event_id: eventId, p_scope: scope, p_patch: patch }),
  );

export const cancelEvent = (
  client: Client,
  eventId: string,
  scope: 'this' | 'this_and_following' | 'all',
  reason: string,
) =>
  scalar<number>(
    call(client)('cancel_event', { p_event_id: eventId, p_scope: scope, p_reason: reason }),
  );

export const deleteEvent = (client: Client, eventId: string) =>
  scalar<null>(call(client)('delete_event', { p_event_id: eventId }));

export const setRsvp = (
  client: Client,
  eventId: string,
  playerId: string,
  status: 'going' | 'not_going' | 'maybe',
  note?: string | null,
) =>
  scalar<null>(
    call(client)('set_rsvp', {
      p_event_id: eventId,
      p_player_id: playerId,
      p_status: status,
      p_note: note ?? null,
    }),
  );

export const staffSetRsvp = (
  client: Client,
  eventId: string,
  playerId: string,
  status: 'going' | 'not_going' | 'maybe',
  note?: string | null,
) =>
  scalar<null>(
    call(client)('staff_set_rsvp', {
      p_event_id: eventId,
      p_player_id: playerId,
      p_status: status,
      p_note: note ?? null,
    }),
  );

export const recordGameResult = (
  client: Client,
  eventId: string,
  ourScore: number,
  theirScore: number,
  periodScores?: { us: number; them: number }[] | null,
  notes?: string | null,
) =>
  scalar<string>(
    call(client)('record_game_result', {
      p_event_id: eventId,
      p_our_score: ourScore,
      p_their_score: theirScore,
      p_period_scores: periodScores ?? null,
      p_notes: notes ?? null,
    }),
  );

export const clearGameResult = (client: Client, eventId: string) =>
  scalar<null>(call(client)('clear_game_result', { p_event_id: eventId }));

export const addLocation = (
  client: Client,
  l: { team_id: string; name: string; address?: string | null; notes?: string | null },
) =>
  one<LocationRow>(
    client
      .from('locations')
      .insert({
        team_id: l.team_id,
        name: l.name,
        address: l.address ?? null,
        notes: l.notes ?? null,
      })
      .select()
      .then((r) => ({ data: r.data ? [r.data] : [], error: r.error }) as never),
  );
export const deleteLocation = (client: Client, id: string) =>
  scalar<null>(
    client
      .from('locations')
      .delete()
      .eq('id', id)
      .then((r) => ({ data: null, error: r.error })),
  );
export const addOpponent = (client: Client, teamId: string, name: string) =>
  one<OpponentRow>(
    client
      .from('opponents')
      .insert({ team_id: teamId, name })
      .select()
      .then((r) => ({ data: r.data ? [r.data] : [], error: r.error }) as never),
  );
export const deleteOpponent = (client: Client, id: string) =>
  scalar<null>(
    client
      .from('opponents')
      .delete()
      .eq('id', id)
      .then((r) => ({ data: null, error: r.error })),
  );

// Calendar feed ----------------------------------------------------------------------------------
export const getFeedTokenStatus = (client: Client) =>
  rows<{ id: string; created_at: string; revoked_at: string | null; last_used_at: string | null }>(
    client
      .from('calendar_feed_tokens')
      .select('id, created_at, revoked_at, last_used_at')
      .is('revoked_at', null),
  );
export const createFeedToken = (client: Client) =>
  scalar<string>(call(client)('create_calendar_feed_token'));
export const rotateFeedToken = (client: Client) =>
  scalar<string>(call(client)('rotate_calendar_feed_token'));
export const revokeFeedToken = (client: Client) =>
  scalar<null>(call(client)('revoke_calendar_feed_token'));
