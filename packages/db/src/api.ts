import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Typed data access shared by web and mobile. Every write goes through a Phase 1 database
 * function (RPC); reads use RLS-protected tables or the read functions. Nothing here
 * decides permissions: the database does.
 */
export type Client = SupabaseClient<Database>;
type Enums = Database['public']['Enums'];

export interface ApiError {
  message: string;
  code?: string | undefined;
  details?: string | null | undefined;
}
export type Result<T> = { data: T; error: null } | { data: null; error: ApiError };

// The generated RPC types mark every argument without a SQL default as non-null, even though
// these functions accept NULL (e.g. add_child with no household, create_invite for a club).
const NULL = null as unknown as string;

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(e: PostgrestError | { message: string } | null): Result<T> => ({
  data: null,
  error: {
    message: e?.message ?? 'Unknown error',
    code: e && 'code' in e ? e.code : undefined,
    details: e && 'details' in e ? e.details : undefined,
  },
});
/** The `data` type of a supabase-js response's success branch. */
type Data<Q> =
  Q extends PromiseLike<infer R>
    ? Extract<R, { error: null }> extends { data: infer D }
      ? D
      : never
    : never;

async function run<Q extends PromiseLike<{ error: PostgrestError | null; data: unknown }>>(
  q: Q,
  fallback?: Data<Q>,
): Promise<Result<Data<Q>>> {
  const res = (await q) as { error: PostgrestError | null; data: Data<Q> | null };
  if (res.error) return fail(res.error);
  if (res.data === null && fallback === undefined) return fail({ message: 'No data returned' });
  return ok((res.data ?? fallback) as Data<Q>);
}

/** For functions that return nothing (void RPCs). */
async function runVoid(q: PromiseLike<{ error: PostgrestError | null }>): Promise<Result<null>> {
  const { error } = await q;
  return error ? fail(error) : ok(null);
}

// Contexts ---------------------------------------------------------------------------------
export async function loadContextSource(client: Client, userId: string) {
  const [h, t, c] = await Promise.all([
    client
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('profile_id', userId),
    client
      .from('team_memberships')
      .select('role, team_id, teams(id, name, sport, season_label)')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .order('created_at'),
    client
      .from('club_memberships')
      .select('role, club_id, clubs(id, name)')
      .eq('profile_id', userId)
      .eq('status', 'active')
      .order('created_at'),
  ]);
  const error = h.error ?? t.error ?? c.error;
  if (error) return fail<never>(error);
  return ok({
    households: (h.data ?? []).flatMap((r) => (r.households ? [r.households] : [])),
    teams: (t.data ?? []).flatMap((r) =>
      r.teams
        ? [
            {
              team_id: r.team_id,
              role: r.role,
              name: r.teams.name,
              sport: r.teams.sport,
              season_label: r.teams.season_label,
            },
          ]
        : [],
    ),
    clubs: (c.data ?? []).flatMap((r) =>
      r.clubs ? [{ club_id: r.club_id, role: r.role, name: r.clubs.name }] : [],
    ),
  });
}

// Clubs and teams --------------------------------------------------------------------------
export const createClub = (client: Client, input: { name: string; slug: string }) =>
  run(client.rpc('create_club', { p_name: input.name, p_slug: input.slug }));

export const createTeam = (
  client: Client,
  input: {
    name: string;
    sport: Enums['sport'];
    seasonLabel: string;
    clubId?: string | null | undefined;
  },
) =>
  run(
    client.rpc('create_team', {
      p_name: input.name,
      p_sport: input.sport,
      p_season_label: input.seasonLabel,
      ...(input.clubId ? { p_club_id: input.clubId } : {}),
    }),
  );

export const findClub = (client: Client, slug: string) =>
  run(client.rpc('find_club', { p_slug: slug }), []);

export const getTeam = (client: Client, teamId: string) =>
  run(client.from('teams').select('*').eq('id', teamId).single());

export const updateTeam = (
  client: Client,
  teamId: string,
  patch: { name: string; sport: Enums['sport']; season_label: string },
) => run(client.from('teams').update(patch).eq('id', teamId).select('*').single());

export const getClub = (client: Client, clubId: string) =>
  run(client.from('clubs').select('*').eq('id', clubId).single());

export const getClubTeams = (client: Client, clubId: string) =>
  run(
    client
      .from('teams')
      .select('id, name, sport, season_label')
      .eq('club_id', clubId)
      .order('name'),
    [],
  );

export const rotateJoinCode = (client: Client, teamId: string) =>
  run(client.rpc('rotate_team_join_code', { p_team_id: teamId }));

// Club affiliation -------------------------------------------------------------------------
export const requestClubLink = (client: Client, teamId: string, clubId: string) =>
  run(client.rpc('request_club_link', { p_team_id: teamId, p_club_id: clubId }));

export const getLinkRequests = (client: Client, target: { teamId: string } | { clubId: string }) =>
  run(
    client.rpc(
      'get_link_requests',
      'teamId' in target ? { p_team_id: target.teamId } : { p_club_id: target.clubId },
    ),
    [],
  );

export const decideClubLink = (client: Client, requestId: string, approve: boolean) =>
  runVoid(client.rpc('decide_club_link', { p_request_id: requestId, p_approve: approve }));

export const unlinkTeamFromClub = (client: Client, teamId: string) =>
  runVoid(client.rpc('unlink_team_from_club', { p_team_id: teamId }));

// Household and children -------------------------------------------------------------------
// One string literal (no concatenation) so supabase-js can infer the joined row type.
const CHILD_SELECT =
  'id, household_id, first_name, last_name, date_of_birth, profile_id, photo_path, login_invite_email, team_players(id, team_id, jersey_number, position, status, teams(id, name, sport, season_label))' as const;

/**
 * The signed-in user's own family: players in households where they are a guardian, plus their
 * own player record. RLS also lets team staff read their rostered players, so this must filter
 * explicitly or coaches and admins would see other families' children.
 */
export async function listChildren(client: Client) {
  const { data: session } = await client.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return ok([] as Data<ReturnType<typeof childrenQuery>>);
  const { data: hms, error } = await client
    .from('household_members')
    .select('household_id')
    .eq('profile_id', uid)
    .eq('relationship', 'guardian');
  if (error) return fail<Data<ReturnType<typeof childrenQuery>>>(error);
  const ids = (hms ?? []).map((h) => h.household_id);
  const mine =
    ids.length > 0
      ? `household_id.in.(${ids.join(',')}),profile_id.eq.${uid}`
      : `profile_id.eq.${uid}`;
  return run(childrenQuery(client).or(mine), []);
}

const childrenQuery = (client: Client) =>
  client.from('players').select(CHILD_SELECT).order('first_name');

export const getChild = (client: Client, id: string) =>
  run(client.from('players').select(CHILD_SELECT).eq('id', id).single());

export const addChild = (
  client: Client,
  input: {
    householdId?: string | null | undefined;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  },
) =>
  run(
    client.rpc('add_child', {
      p_household_id: input.householdId ?? NULL,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_date_of_birth: input.dateOfBirth,
    }),
  );

export const updateChild = (
  client: Client,
  id: string,
  input: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    loginInviteEmail?: string | null | undefined;
    photoPath?: string | null | undefined;
  },
) =>
  run(
    client
      .from('players')
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        date_of_birth: input.dateOfBirth,
        login_invite_email: input.loginInviteEmail ?? null,
        ...(input.photoPath !== undefined ? { photo_path: input.photoPath } : {}),
      })
      .eq('id', id)
      .select('id')
      .single(),
  );

export const createHouseholdInvite = (
  client: Client,
  input: { householdId: string; expiresInDays?: number; maxUses?: number },
) =>
  run(
    client.rpc('create_household_invite', {
      p_household_id: input.householdId,
      p_expires_in: `${input.expiresInDays ?? 7} days`,
      p_max_uses: input.maxUses ?? 1,
    }),
  );

// Roster -----------------------------------------------------------------------------------
export const getRoster = (client: Client, teamId: string) =>
  run(client.rpc('get_team_roster', { p_team_id: teamId }), []);

export const getPlayer = (client: Client, playerId: string) =>
  run(
    client
      .from('players')
      .select('id, first_name, last_name, date_of_birth, household_id')
      .eq('id', playerId)
      .single(),
  );

export const getGuardianContacts = (client: Client, playerId: string) =>
  run(client.rpc('get_guardian_contacts', { p_player_id: playerId }), []);

export const placePlayerOnRoster = (
  client: Client,
  input: {
    teamId: string;
    playerId: string;
    jerseyNumber?: number | null | undefined;
    position?: string | null | undefined;
    status?: Enums['roster_status'];
  },
) =>
  run(
    client.rpc('place_player_on_roster', {
      p_team_id: input.teamId,
      p_player_id: input.playerId,
      ...(input.jerseyNumber != null ? { p_jersey_number: input.jerseyNumber } : {}),
      ...(input.position ? { p_position: input.position } : {}),
      p_status: input.status ?? 'active',
    }),
  );

export const updateRosterRow = (
  client: Client,
  teamPlayerId: string,
  patch: { jersey_number: number | null; position: string | null; status: Enums['roster_status'] },
) => run(client.from('team_players').update(patch).eq('id', teamPlayerId).select('id').single());

export const removeFromRoster = (client: Client, teamPlayerId: string) =>
  run(client.from('team_players').delete().eq('id', teamPlayerId).select('id'), []);

// Members ----------------------------------------------------------------------------------
export const getTeamMembers = (client: Client, teamId: string) =>
  run(client.rpc('get_team_members', { p_team_id: teamId }), []);

export const setMemberRole = (client: Client, membershipId: string, role: Enums['team_role']) =>
  run(
    client.from('team_memberships').update({ role }).eq('id', membershipId).select('id').single(),
  );

export const removeMember = (client: Client, membershipId: string) =>
  run(client.from('team_memberships').delete().eq('id', membershipId).select('id'), []);

// Invites ----------------------------------------------------------------------------------
export type InviteTarget = { teamId: string } | { clubId: string } | { householdId: string };

export const createInvite = (
  client: Client,
  input: {
    target: { teamId: string } | { clubId: string };
    role: string;
    expiresInDays?: number;
    maxUses?: number;
  },
) =>
  run(
    client.rpc('create_invite', {
      p_team_id: 'teamId' in input.target ? input.target.teamId : NULL,
      p_club_id: 'clubId' in input.target ? input.target.clubId : NULL,
      p_role: input.role,
      p_expires_in: `${input.expiresInDays ?? 7} days`,
      p_max_uses: input.maxUses ?? 1,
    }),
  );

export const listInvites = (client: Client, target: InviteTarget) => {
  const q = client
    .from('invites')
    .select('id, role, expires_at, max_uses, use_count, revoked_at, created_at')
    .order('created_at', { ascending: false });
  const filtered =
    'teamId' in target
      ? q.eq('team_id', target.teamId)
      : 'clubId' in target
        ? q.eq('club_id', target.clubId)
        : q.eq('household_id', target.householdId);
  return run(filtered, []);
};

export const revokeInvite = (client: Client, inviteId: string) =>
  runVoid(client.rpc('revoke_invite', { p_invite_id: inviteId }));

export const previewInvite = (client: Client, token: string) =>
  run(client.rpc('preview_invite', { p_token: token }), []);

export const acceptInvite = (client: Client, token: string) =>
  run(client.rpc('accept_invite', { p_token: token }), []);

// Join requests ----------------------------------------------------------------------------
export const requestToJoin = (
  client: Client,
  input: {
    teamCode?: string | null | undefined;
    teamId?: string | null | undefined;
    playerId?: string | null | undefined;
    message?: string | null | undefined;
  },
) =>
  run(
    client.rpc('request_to_join', {
      ...(input.teamCode ? { p_team_code: input.teamCode } : {}),
      ...(input.teamId ? { p_team_id: input.teamId } : {}),
      ...(input.playerId ? { p_player_id: input.playerId } : {}),
      ...(input.message ? { p_message: input.message } : {}),
    }),
  );

export const getJoinRequests = (client: Client, teamId: string) =>
  run(client.rpc('get_join_requests', { p_team_id: teamId }), []);

export const decideJoinRequest = (client: Client, requestId: string, approve: boolean) =>
  runVoid(client.rpc('decide_join_request', { p_request_id: requestId, p_approve: approve }));

// Player logins ----------------------------------------------------------------------------
export const claimPlayerLogin = (client: Client, playerId: string) =>
  run(client.rpc('claim_player_login', { p_player_id: playerId }));

export const getPlayerLoginClaims = (client: Client) =>
  run(client.rpc('get_player_login_claims'), []);

export const decidePlayerLoginClaim = (client: Client, claimId: string, approve: boolean) =>
  runVoid(client.rpc('decide_player_login_claim', { p_claim_id: claimId, p_approve: approve }));

// Child photos (private bucket; access follows the player row, see the storage migration) ----
export const PHOTO_BUCKET = 'player-photos';

/**
 * Upload a new photo for a child, point the player row at it, and delete the previous object.
 * `body` is a Blob/File (web) or ArrayBuffer (React Native).
 */
export async function setChildPhoto(
  client: Client,
  input: {
    playerId: string;
    body: Blob | ArrayBuffer;
    contentType: string;
    previousPath?: string | null;
  },
): Promise<Result<string>> {
  const ext =
    input.contentType === 'image/png' ? 'png' : input.contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${input.playerId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const up = await client.storage
    .from(PHOTO_BUCKET)
    .upload(path, input.body, { contentType: input.contentType, upsert: false });
  if (up.error) return fail({ message: up.error.message });
  const upd = await client
    .from('players')
    .update({ photo_path: path })
    .eq('id', input.playerId)
    .select('id');
  if (upd.error) return fail(upd.error);
  if (input.previousPath) await client.storage.from(PHOTO_BUCKET).remove([input.previousPath]);
  return ok(path);
}

/** Short-lived signed URL for displaying a photo to someone allowed to see the player. */
export async function getPhotoUrl(client: Client, path: string): Promise<Result<string>> {
  const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return error || !data ? fail({ message: error?.message ?? 'No URL' }) : ok(data.signedUrl);
}

// Messaging (Phase 3) ----------------------------------------------------------------------------
export const getThreadList = (client: Client, teamId: string) =>
  run(client.rpc('get_thread_list', { p_team_id: teamId }), []);

export const getUnreadTotal = (client: Client) => run(client.rpc('get_unread_total'), 0);

export const createThread = (
  client: Client,
  input: {
    teamId: string;
    type: 'announcement' | 'group' | 'direct';
    title?: string | null;
    participantIds?: string[];
  },
) =>
  run(
    client.rpc('create_thread', {
      p_team_id: input.teamId,
      p_type: input.type,
      p_title: input.title ?? NULL,
      p_participant_ids: input.participantIds ?? [],
    }),
  );

export const getThreadMembers = (client: Client, threadId: string) =>
  run(client.rpc('get_thread_members', { p_thread_id: threadId }), []);

export const getThread = (client: Client, threadId: string) =>
  run(client.from('threads').select('*').eq('id', threadId).single());

const MESSAGE_COLUMNS =
  'id, thread_id, sender_profile_id, body, reply_to_id, created_at, edited_at, deleted_at, hidden_at, message_attachments(id, storage_path, mime_type, size_bytes), message_reactions(profile_id, emoji)';

/** Newest-first page of messages; pass the oldest row you hold as `before` to page upward. */
export const getMessagesPage = (
  client: Client,
  threadId: string,
  opts: { before?: { createdAt: string; id: string } | null; limit?: number } = {},
) => {
  let q = client
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.before) {
    q = q.or(
      `created_at.lt.${opts.before.createdAt},and(created_at.eq.${opts.before.createdAt},id.lt.${opts.before.id})`,
    );
  }
  return run(q, []);
};

export const getMessage = (client: Client, messageId: string) =>
  run(client.from('messages').select(MESSAGE_COLUMNS).eq('id', messageId).single());

export type MessageRow = Awaited<ReturnType<typeof getMessage>> extends Result<infer R> ? R : never;

export const sendMessage = (
  client: Client,
  input: {
    threadId: string;
    body: string;
    replyTo?: string | null;
    attachments?: { storage_path: string; mime_type: string; size_bytes: number }[];
  },
) =>
  run(
    client.rpc('send_message', {
      p_thread_id: input.threadId,
      p_body: input.body,
      p_reply_to: input.replyTo ?? NULL,
      p_attachments: input.attachments ?? [],
    }),
  );

export const editMessage = (client: Client, messageId: string, body: string) =>
  runVoid(client.rpc('edit_message', { p_message_id: messageId, p_body: body }));
export const deleteMessage = (client: Client, messageId: string) =>
  runVoid(client.rpc('delete_message', { p_message_id: messageId }));
export const hideMessage = (client: Client, messageId: string, reason?: string) =>
  runVoid(client.rpc('hide_message', { p_message_id: messageId, p_reason: reason ?? NULL }));
export const getHiddenMessage = (client: Client, messageId: string) =>
  run(client.rpc('get_hidden_message', { p_message_id: messageId }), []);
export const reportMessage = (client: Client, messageId: string, reason: string) =>
  run(client.rpc('report_message', { p_message_id: messageId, p_reason: reason }));
export const reviewReport = (client: Client, reportId: string, status: 'actioned' | 'dismissed') =>
  runVoid(client.rpc('review_report', { p_report_id: reportId, p_status: status }));
export const toggleReaction = (client: Client, messageId: string, emoji: string) =>
  run(client.rpc('toggle_reaction', { p_message_id: messageId, p_emoji: emoji }));
export const markThreadRead = (client: Client, threadId: string, messageId: string) =>
  runVoid(client.rpc('mark_thread_read', { p_thread_id: threadId, p_message_id: messageId }));
export const setThreadMute = (client: Client, threadId: string, until: string | null) =>
  runVoid(client.rpc('set_thread_mute', { p_thread_id: threadId, p_until: until as string }));
export const addParticipant = (client: Client, threadId: string, profileId: string) =>
  runVoid(client.rpc('add_participant', { p_thread_id: threadId, p_profile_id: profileId }));
export const removeParticipant = (client: Client, threadId: string, profileId: string) =>
  runVoid(client.rpc('remove_participant', { p_thread_id: threadId, p_profile_id: profileId }));

export const getThreadReads = (client: Client, threadId: string) =>
  run(
    client.from('message_reads').select('profile_id, last_read_at').eq('thread_id', threadId),
    [],
  );

export const getReportQueue = (client: Client) =>
  run(
    client
      .from('message_reports')
      .select('id, message_id, reason, status, created_at, reporter_profile_id')
      .eq('status', 'open')
      .order('created_at'),
    [],
  );

/** Upload to the private attachments bucket. Path: <thread_id>/<uuid>/<filename>. */
export async function uploadAttachment(
  client: Client,
  threadId: string,
  file: Blob | ArrayBuffer,
  fileName: string,
  contentType: string,
): Promise<Result<string>> {
  const safe = fileName.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  const path = `${threadId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}/${safe}`;
  const { error } = await client.storage
    .from('message-attachments')
    .upload(path, file, { contentType, upsert: false });
  return error ? fail(error) : ok(path);
}

export async function getAttachmentUrl(client: Client, path: string): Promise<Result<string>> {
  const { data, error } = await client.storage
    .from('message-attachments')
    .createSignedUrl(path, 3600);
  return error || !data ? fail(error) : ok(data.signedUrl);
}

/** Realtime channels are keyed by name; give each subscription its own so two components never share one. */
const uniqueSuffix = () => Math.random().toString(36).slice(2, 10);

export interface ThreadSubscription {
  /** Broadcast a typing event on the private thread channel. */
  sendTyping: () => void;
  unsubscribe: () => void;
}

/**
 * Live updates for one open thread. Row changes come from Postgres Changes (Realtime applies
 * RLS per subscriber, so a non-participant receives nothing); typing uses Broadcast on a PRIVATE
 * channel authorised by thread membership. `onStatus('SUBSCRIBED')` fires after every
 * (re)connect so callers can refetch what they missed and merge without duplicates.
 */
export function subscribeToThread(
  client: Client,
  threadId: string,
  handlers: {
    onMessage: (messageId: string) => void;
    onReaction: () => void;
    onRead: () => void;
    onTyping: (profileId: string) => void;
    onStatus?: (status: string) => void;
  },
  myId: string,
): ThreadSubscription {
  const filter = `thread_id=eq.${threadId}`;
  const rows = client
    .channel(`rows:${threadId}:${uniqueSuffix()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, (p) => {
      const id = (p.new as { id?: string }).id;
      if (id) handlers.onMessage(id);
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'message_reactions', filter },
      () => handlers.onReaction(),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads', filter }, () =>
      handlers.onRead(),
    )
    .subscribe((s) => handlers.onStatus?.(s));
  const typing = client
    .channel(`thread:${threadId}`, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, (m) => {
      const who = (m.payload as { profile_id?: string }).profile_id;
      if (who && who !== myId) handlers.onTyping(who);
    })
    .subscribe();
  return {
    sendTyping: () => {
      void typing.send({ type: 'broadcast', event: 'typing', payload: { profile_id: myId } });
    },
    unsubscribe: () => {
      void client.removeChannel(rows);
      void client.removeChannel(typing);
    },
  };
}

/** Live unread / new-notification feed for the signed-in user (in-app outbox rows). */
export function subscribeToNotifications(client: Client, userId: string, onChange: () => void) {
  const ch = client
    .channel(`notifications:${userId}:${uniqueSuffix()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_outbox',
        filter: `profile_id=eq.${userId}`,
      },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'message_reads', filter: `profile_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => void client.removeChannel(ch);
}

export const getMessageablePeople = (client: Client, teamId: string) =>
  run(client.rpc('get_messageable_people', { p_team_id: teamId }), []);

// Notifications (Phase 3, Part C) ----------------------------------------------------------------
export const getNotificationPreferences = (client: Client, userId: string) =>
  run(
    client
      .from('notification_preferences')
      .select(
        'channel, category, enabled, quiet_hours_start, quiet_hours_end, timezone, include_preview',
      )
      .eq('profile_id', userId),
    [],
  );

/** Update one channel/category row (rows are seeded for every profile). */
export const saveNotificationPreference = (
  client: Client,
  userId: string,
  channel: 'push' | 'email',
  category: 'messages' | 'announcements' | 'schedule' | 'payments' | 'registration',
  patch: {
    enabled?: boolean;
    quiet_hours_start?: string | null;
    quiet_hours_end?: string | null;
    timezone?: string;
    include_preview?: boolean;
  },
) =>
  runVoid(
    client
      .from('notification_preferences')
      .update(patch)
      .eq('profile_id', userId)
      .eq('channel', channel)
      .eq('category', category),
  );

/** Apply quiet hours and timezone to every push and email row at once (the UI sets them globally). */
export const saveQuietHours = (
  client: Client,
  userId: string,
  q: { start: string | null; end: string | null; timezone: string },
) =>
  runVoid(
    client
      .from('notification_preferences')
      .update({ quiet_hours_start: q.start, quiet_hours_end: q.end, timezone: q.timezone })
      .eq('profile_id', userId),
  );

export const getMyDevices = (client: Client) =>
  run(
    client
      .from('push_devices')
      .select('id, platform, device_label, token, last_seen_at, revoked_at')
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false }),
    [],
  );

export const registerPushDevice = (
  client: Client,
  input: {
    platform: 'ios' | 'android' | 'web';
    token: string;
    subscription?: { p256dh: string; auth: string } | null;
    label?: string | null;
  },
) =>
  run(
    client.rpc('register_push_device', {
      p_platform: input.platform,
      p_token: input.token,
      p_subscription: (input.subscription ?? NULL) as never,
      p_label: input.label ?? NULL,
    }),
  );

export const revokePushDevice = (client: Client, input: { deviceId?: string; token?: string }) =>
  runVoid(
    client.rpc('revoke_push_device', {
      p_device_id: input.deviceId ?? NULL,
      p_token: input.token ?? NULL,
    }),
  );

/** Tell the delivery worker which thread this device has open (null = none) so it is not buzzed for it. */
export const setActiveThread = (client: Client, token: string, threadId: string | null) =>
  runVoid(client.rpc('set_active_thread', { p_token: token, p_thread_id: threadId as string }));

export const getInAppNotifications = (client: Client, limit = 30) =>
  run(
    client
      .from('notification_outbox')
      .select('id, category, payload, created_at, read_at')
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false })
      .limit(limit),
    [],
  );

export const markNotificationsRead = (client: Client, ids?: string[]) =>
  run(client.rpc('mark_notifications_read', ids ? { p_ids: ids } : {}), 0);

export const getNotificationFailures = (client: Client, teamId: string) =>
  run(client.rpc('get_notification_failures', { p_team_id: teamId }), []);

/** New in-app notification rows for this user (drives toasts and the badge). */
export function subscribeToInApp(
  client: Client,
  userId: string,
  onNew: (n: { id: string; category: string; payload: Record<string, unknown> }) => void,
) {
  const ch = client
    .channel(`inapp:${userId}:${Math.random().toString(36).slice(2, 10)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_outbox',
        filter: `profile_id=eq.${userId}`,
      },
      (p) => {
        const row = p.new as {
          id: string;
          channel: string;
          category: string;
          payload: Record<string, unknown>;
        };
        if (row.channel === 'in_app') onNew(row);
      },
    )
    .subscribe();
  return () => void client.removeChannel(ch);
}

// Account (profile, photo, leaving places, deletion) ---------------------------------------------
export const AVATAR_BUCKET = 'avatars';

/** The signed-in user's own profile (profiles are readable only by their owner). */
export const getMyProfile = (client: Client, userId: string) =>
  run(
    client
      .from('profiles')
      .select('id, display_name, avatar_url, created_at')
      .eq('id', userId)
      .single(),
  );

/** Change the display name and/or avatar. RLS and the column grant limit this to the caller's own row. */
export const updateMyProfile = (
  client: Client,
  userId: string,
  patch: { display_name?: string; avatar_url?: string | null },
) => runVoid(client.from('profiles').update(patch).eq('id', userId));

/** Short-lived URL for showing the user's own photo. External (OAuth) pictures are returned as they are. */
export async function getAvatarUrl(
  client: Client,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (/^https:\/\//.test(value)) return value;
  const { data } = await client.storage.from(AVATAR_BUCKET).createSignedUrl(value, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Upload a new photo into the user's folder, point the profile at it, then delete the previous
 * object. `body` is a Blob/File (web) or ArrayBuffer (React Native); the client has already
 * cropped it to a square and validated type and size.
 */
export async function setMyAvatar(
  client: Client,
  input: {
    userId: string;
    body: Blob | ArrayBuffer;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    previous?: string | null;
  },
): Promise<Result<string>> {
  const ext =
    input.contentType === 'image/png' ? 'png' : input.contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${input.userId}/${Date.now()}.${ext}`;
  const up = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, input.body, { contentType: input.contentType, upsert: false });
  if (up.error) return fail({ message: up.error.message });
  const upd = await updateMyProfile(client, input.userId, { avatar_url: path });
  if (upd.error) {
    await client.storage.from(AVATAR_BUCKET).remove([path]);
    return fail(upd.error);
  }
  if (input.previous && !/^https:\/\//.test(input.previous))
    await client.storage.from(AVATAR_BUCKET).remove([input.previous]);
  return ok(path);
}

export async function removeMyAvatar(
  client: Client,
  input: { userId: string; previous?: string | null },
): Promise<Result<null>> {
  const upd = await updateMyProfile(client, input.userId, { avatar_url: null });
  if (upd.error) return upd;
  if (input.previous && !/^https:\/\//.test(input.previous))
    await client.storage.from(AVATAR_BUCKET).remove([input.previous]);
  return ok(null);
}

/**
 * Leave a team or club: the existing "members can leave" delete policy applies, and the last-admin
 * trigger refuses (error message `last_admin`) when this user is the only active admin.
 */
export const leaveTeam = (client: Client, teamId: string, userId: string) =>
  runVoid(client.from('team_memberships').delete().eq('team_id', teamId).eq('profile_id', userId));

export const leaveClub = (client: Client, clubId: string, userId: string) =>
  runVoid(client.from('club_memberships').delete().eq('club_id', clubId).eq('profile_id', userId));

export interface AccountBlockers {
  teams: { id: string; name: string }[];
  clubs: { id: string; name: string }[];
  households: { id: string; name: string }[];
  plans: { id: string; name: string }[];
}

/** What must be handed over before this account can be deleted (empty lists = nothing). */
export const getAccountBlockers = (client: Client) =>
  run(client.rpc('account_deletion_blockers')) as Promise<Result<AccountBlockers>>;

/** Permanently delete the signed-in user's account (edge function, service role inside). */
export async function deleteMyAccount(
  client: Client,
  confirm: string,
): Promise<Result<{ blockers?: AccountBlockers }>> {
  const { error, data } = await client.functions.invoke('delete-account', { body: { confirm } });
  if (!error) return ok({});
  const ctx = (error as { context?: Response }).context;
  const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
  if (body?.error === 'blocked')
    return {
      data: null,
      error: { message: 'blocked', code: 'blocked', details: JSON.stringify(body.blockers) },
    };
  void data;
  return fail({ message: body?.error ?? error.message });
}
