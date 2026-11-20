/**
 * Pure messaging logic shared by web and mobile: grouping into runs, day labels, delivery
 * status, optimistic-send merging and screen-reader labels. No I/O, no React.
 */

import type { AppContext } from './context';
import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
} from './constants';

export type SendState = 'sent' | 'sending' | 'failed';

export interface ChatMessage {
  /** Server id, or the client id while the message is still sending. */
  id: string;
  /** Stable across the optimistic -> confirmed swap; lets a reconnect refetch avoid duplicates. */
  clientId?: string | undefined;
  senderId: string | null;
  senderName: string | null;
  body: string;
  createdAt: string;
  editedAt?: string | null | undefined;
  /** Soft-deleted by the sender. */
  deleted?: boolean | undefined;
  /** Hidden by staff (shown as "Removed by staff"). */
  hidden?: boolean | undefined;
  replyToId?: string | null | undefined;
  sendState?: SendState | undefined;
}

export type ChatItem =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: ChatMessage;
      own: boolean;
      /** First of a run: show the sender name (received messages only). */
      firstInRun: boolean;
      /** Last of a run: tight tail corner, timestamp and status underneath. */
      lastInRun: boolean;
    };

/** Messages from the same sender within this window form one run. */
export const RUN_GAP_MS = 5 * 60 * 1000;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function dayLabel(date: Date, now: Date = new Date(), locale?: string): string {
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function timeLabel(date: Date, locale?: string): string {
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** Oldest-first messages -> day separators and message items with run flags. */
export function groupMessages(
  messages: readonly ChatMessage[],
  myId: string | null,
  now: Date = new Date(),
  locale?: string,
): ChatItem[] {
  const items: ChatItem[] = [];
  let prev: ChatMessage | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const next = messages[i + 1] ?? null;
    const d = new Date(m.createdAt);
    const newDay = !prev || !sameDay(new Date(prev.createdAt), d);
    if (newDay) {
      items.push({ kind: 'day', key: `day-${d.toDateString()}`, label: dayLabel(d, now, locale) });
    }
    const continues = (a: ChatMessage, b: ChatMessage) =>
      a.senderId === b.senderId &&
      sameDay(new Date(a.createdAt), new Date(b.createdAt)) &&
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() <= RUN_GAP_MS;
    const firstInRun = newDay || !prev || !continues(prev, m);
    const lastInRun = !next || !continues(m, next);
    items.push({
      kind: 'message',
      key: m.clientId ?? m.id,
      message: m,
      own: m.senderId !== null && m.senderId === myId,
      firstInRun,
      lastInRun,
    });
    prev = m;
  }
  return items;
}

/** Newest-first page from the server + what we already hold -> one oldest-first list, no duplicates. */
export function mergeMessages(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();
  const put = (m: ChatMessage) => {
    const key = m.clientId ?? m.id;
    const cur = byKey.get(key) ?? byKey.get(m.id);
    // A confirmed copy always replaces an optimistic one; otherwise later data wins.
    byKey.set(key, cur && cur.sendState === undefined && m.sendState !== undefined ? cur : m);
    if (m.clientId && m.clientId !== m.id) byKey.delete(m.id);
  };
  existing.forEach(put);
  incoming.forEach(put);
  return [...byKey.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export type DeliveryStatus = 'Sending' | 'Failed' | 'Delivered' | 'Read';

/**
 * Status line under the last own bubble of a run. `othersReadAt` are the other participants'
 * last_read_at values (empty for announcements or when unknown): "Read" once any has read it.
 */
export function deliveryStatus(
  message: ChatMessage,
  othersReadAt: readonly (string | null)[],
): DeliveryStatus {
  if (message.sendState === 'sending') return 'Sending';
  if (message.sendState === 'failed') return 'Failed';
  return othersReadAt.some((r) => r !== null && r >= message.createdAt) ? 'Read' : 'Delivered';
}

/** "You, 4:14 PM, read" / "Sam Lee, 4:14 PM". */
export function messageA11yLabel(
  item: { message: ChatMessage; own: boolean },
  status: DeliveryStatus | null,
  locale?: string,
): string {
  const { message, own } = item;
  const who = own ? 'You' : (message.senderName ?? 'Someone');
  const when = timeLabel(new Date(message.createdAt), locale);
  if (message.hidden) return `${who}, ${when}, removed by staff`;
  if (message.deleted) return `${who}, ${when}, deleted`;
  return `${who}, ${when}${status ? `, ${status.toLowerCase()}` : ''}${message.editedAt ? ', edited' : ''}: ${message.body}`;
}

/** One-line thread-list preview. */
export function previewOf(
  message: Pick<ChatMessage, 'body' | 'deleted' | 'hidden'> | null,
): string {
  if (!message) return 'No messages yet';
  if (message.hidden) return 'Removed by staff';
  if (message.deleted) return 'Message deleted';
  return message.body.replace(/\s+/g, ' ').trim();
}

/** "24 members" / "1 member". */
export const memberCountLabel = (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`;

/** Unread = newest message is from someone else and is newer than the last-read marker. */
export function isUnread(
  lastMessage: { createdAt: string; senderId: string | null } | null,
  myId: string | null,
  lastReadAt: string | null,
): boolean {
  if (!lastMessage || lastMessage.senderId === myId) return false;
  return lastReadAt === null || lastMessage.createdAt > lastReadAt;
}

/** Short list timestamp: time today, "Yesterday", else a short date. */
export function listTimeLabel(iso: string, now: Date = new Date(), locale?: string): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return timeLabel(d, locale);
  const label = dayLabel(d, now, locale);
  return label === 'Yesterday'
    ? label
    : d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export interface OutboxEntry {
  clientId: string;
  threadId: string;
  body: string;
  replyToId?: string | null;
  createdAt: string;
  attempts: number;
}

/** Exponential backoff for retrying queued offline sends, capped at 30s. */
export const retryDelayMs = (attempts: number) =>
  Math.min(30_000, 1000 * 2 ** Math.max(0, attempts));

// ---------------------------------------------------------------------------------------------
// Unified inbox (one list across every team). Everything below is pure and takes `now` so tests
// can inject a clock. The database stays the authority for every rule; this only explains them.
// ---------------------------------------------------------------------------------------------

export type ThreadKind = 'direct' | 'group' | 'announcement';

/** A `get_inbox` row, camelCased. */
export interface InboxRow {
  threadId: string;
  type: ThreadKind;
  title: string | null;
  /** Thread-wide archive (staff action; closes posting). */
  archivedAt: string | null;
  lastMessageAt: string;
  lastBody: string | null;
  lastSenderId: string | null;
  lastSenderName: string | null;
  lastMessageId: string | null;
  lastDeleted: boolean;
  lastHidden: boolean;
  lastCreatedAt: string | null;
  unreadCount: number;
  memberCount: number;
  otherName: string | null;
  otherProfileId: string | null;
  mutedUntil: string | null;
  teamId: string;
  teamName: string;
  sport: string;
  pinnedAt: string | null;
  archivedForMe: boolean;
  /** Staff only, and only when the newest message is the caller's own. */
  lastReadCount: number | null;
  lastReadTotal: number | null;
}

/** Raw `get_inbox` row as returned by the database. */
export interface RawInboxRow {
  thread_id: string;
  type: string;
  title: string | null;
  archived_at: string | null;
  last_message_at: string;
  last_message_id: string | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  last_deleted: boolean | null;
  last_hidden: boolean | null;
  last_created_at: string | null;
  unread_count: number;
  member_count: number;
  other_name: string | null;
  other_profile_id: string | null;
  muted_until: string | null;
  team_id: string;
  team_name: string;
  sport: string;
  pinned_at: string | null;
  archived_for_me: boolean | null;
  last_read_count: number | null;
  last_read_total: number | null;
}

export function inboxRowFromDb(r: RawInboxRow): InboxRow {
  return {
    threadId: r.thread_id,
    type: r.type as ThreadKind,
    title: r.title,
    archivedAt: r.archived_at,
    lastMessageAt: r.last_message_at,
    lastMessageId: r.last_message_id,
    lastBody: r.last_body,
    lastSenderId: r.last_sender_id,
    lastSenderName: r.last_sender_name,
    lastDeleted: r.last_deleted ?? false,
    lastHidden: r.last_hidden ?? false,
    lastCreatedAt: r.last_created_at,
    unreadCount: r.unread_count,
    memberCount: r.member_count,
    otherName: r.other_name,
    otherProfileId: r.other_profile_id,
    mutedUntil: r.muted_until,
    teamId: r.team_id,
    teamName: r.team_name,
    sport: r.sport,
    pinnedAt: r.pinned_at,
    archivedForMe: r.archived_for_me ?? false,
    lastReadCount: r.last_read_count,
    lastReadTotal: r.last_read_total,
  };
}

export const isMuted = (mutedUntil: string | null, now: Date = new Date()) =>
  mutedUntil !== null && new Date(mutedUntil).getTime() > now.getTime();

/** "Archived until the next message": archived_at >= last_message_at (mirrors the database). */
export const isArchivedForMe = (archivedAt: string | null, lastMessageAt: string) =>
  archivedAt !== null && archivedAt >= lastMessageAt;

export const MAX_PINNED_THREADS = 5;

/** Display title of a thread: the other person for direct, the title otherwise. */
export const threadTitle = (row: Pick<InboxRow, 'type' | 'title' | 'otherName'>) =>
  row.type === 'direct' ? (row.otherName ?? 'Direct message') : (row.title ?? 'Conversation');

const firstName = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * Preview text. "You: ..." for own messages, the sender's first name in groups and announcements
 * (direct threads show the body alone), and the plain statuses for removed or deleted messages.
 */
export function inboxPreview(row: InboxRow, myId: string | null): string {
  if (row.lastCreatedAt === null) return 'No messages yet';
  if (row.lastHidden) return 'Removed by staff';
  if (row.lastDeleted) return 'Message deleted';
  const body = (row.lastBody ?? '').replace(/\s+/g, ' ').trim();
  if (row.lastSenderId !== null && row.lastSenderId === myId) return `You: ${body}`;
  if (row.type !== 'direct') {
    const who = firstName(row.lastSenderName);
    return who ? `${who}: ${body}` : body;
  }
  return body;
}

/** Row state by priority: Failed, Unread, Draft, Muted, Archived (only inside Archived), else none. */
export type RowStatus = 'failed' | 'unread' | 'draft' | 'muted' | 'archived' | 'none';

export function rowStatus(
  row: InboxRow,
  ctx: { hasFailed: boolean; draft: string | null; inArchivedFilter: boolean; now?: Date },
): RowStatus {
  if (ctx.hasFailed) return 'failed';
  const muted = isMuted(row.mutedUntil, ctx.now);
  if (row.unreadCount > 0 && !muted) return 'unread';
  if (ctx.draft && ctx.draft.trim()) return 'draft';
  if (muted) return 'muted';
  if (ctx.inArchivedFilter && (row.archivedForMe || row.archivedAt !== null)) return 'archived';
  return 'none';
}

/** "Draft: ..." line for the inbox. */
export const draftPreview = (draft: string) => `Draft: ${draft.replace(/\s+/g, ' ').trim()}`;

/** Team chips show only for a person in 2+ teams, and never for a player 13 to 17. */
export const showTeamChip = (teamCount: number, isPlayer: boolean) => teamCount >= 2 && !isPlayer;

/** Filter chips: players 13 to 17 get search only. */
export const showFilterChips = (isPlayer: boolean) => !isPlayer;

export type InboxFilter =
  | { kind: 'all' }
  | { kind: 'unread' }
  | { kind: 'announcements' }
  | { kind: 'team'; teamId: string }
  | { kind: 'archived' };

export function filterInbox(
  rows: readonly InboxRow[],
  filter: InboxFilter,
  now: Date = new Date(),
): InboxRow[] {
  const archived = (r: InboxRow) => r.archivedForMe || r.archivedAt !== null;
  switch (filter.kind) {
    case 'archived':
      return rows.filter(archived);
    case 'unread':
      return rows.filter((r) => !archived(r) && r.unreadCount > 0 && !isMuted(r.mutedUntil, now));
    case 'announcements':
      return rows.filter((r) => !archived(r) && r.type === 'announcement');
    case 'team':
      return rows.filter((r) => !archived(r) && r.teamId === filter.teamId);
    default:
      return rows.filter((r) => !archived(r));
  }
}

/** Pinned first (most recently pinned first), then newest. Stable for equal times. */
export function sortInbox(rows: readonly InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => {
    if ((a.pinnedAt !== null) !== (b.pinnedAt !== null)) return a.pinnedAt !== null ? -1 : 1;
    if (a.pinnedAt && b.pinnedAt && a.pinnedAt !== b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
    return b.lastMessageAt.localeCompare(a.lastMessageAt) || b.threadId.localeCompare(a.threadId);
  });
}

/** The most recent unread announcement, shown as the calm card at the top of All. */
export function featuredAnnouncement(rows: readonly InboxRow[], now: Date = new Date()): InboxRow | null {
  const open = filterInbox(rows, { kind: 'announcements' }, now).filter(
    (r) => r.unreadCount > 0 && !isMuted(r.mutedUntil, now),
  );
  return sortInbox(open).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))[0] ?? null;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

/** Conversation names, people, team names and previews already loaded. */
export function searchInbox(rows: readonly InboxRow[], query: string, myId: string | null): InboxRow[] {
  const q = norm(query);
  if (!q) return [...rows];
  return rows.filter((r) =>
    [threadTitle(r), r.otherName ?? '', r.teamName, r.lastSenderName ?? '', inboxPreview(r, myId)].some((f) =>
      norm(f).includes(q),
    ),
  );
}

/** Server message search starts at 3 characters (the function itself allows 2). */
export const SERVER_SEARCH_MIN_CHARS = 3;
export const shouldSearchServer = (query: string) => query.trim().length >= SERVER_SEARCH_MIN_CHARS;

// Compose -----------------------------------------------------------------------------------

export interface ComposePerson {
  profileId: string;
  displayName: string;
  role: string;
  isMinor: boolean;
  canDirect: boolean;
  reason: string | null;
}

export interface ComposeGroup {
  teamId: string;
  teamName: string;
  people: Array<ComposePerson & { existingThreadId: string | null }>;
}

/** Plain-language reason for a disabled compose row. */
export const composeReasonText = (reason: string | null): string | null =>
  reason === 'direct_minor_guardian_only'
    ? 'Direct messages with a player under 18 go through their parent or guardian.'
    : null;

/** Existing direct thread with this person in this team (matched from the inbox). */
export function findDirectThread(
  rows: readonly InboxRow[],
  teamId: string,
  profileId: string,
): InboxRow | null {
  return rows.find((r) => r.type === 'direct' && r.teamId === teamId && r.otherProfileId === profileId) ?? null;
}

/** People grouped by team (a person on two of your teams appears under each), filtered by search. */
export function groupComposePeople(
  teams: ReadonlyArray<{ teamId: string; teamName: string; people: readonly ComposePerson[] }>,
  rows: readonly InboxRow[],
  query: string,
): ComposeGroup[] {
  const q = norm(query);
  return teams
    .map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      people: t.people
        .filter((p) => !q || norm(p.displayName).includes(q))
        .map((p) => ({ ...p, existingThreadId: findDirectThread(rows, t.teamId, p.profileId)?.threadId ?? null }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .filter((g) => g.people.length > 0);
}

const STAFF_ROLES = ['admin', 'coach', 'manager'];

/**
 * Mirror of the database rule for groups with a minor: two staff adults, or one staff adult plus
 * a parent. The creator counts as one staff adult. The database checks the actual guardian link
 * and stays the authority; this only disables Create early and explains why.
 */
export function minorGroupCheck(selected: readonly Pick<ComposePerson, 'role' | 'isMinor'>[]): {
  hasMinor: boolean;
  ok: boolean;
} {
  const hasMinor = selected.some((p) => p.isMinor);
  if (!hasMinor) return { hasMinor, ok: true };
  const staff = 1 + selected.filter((p) => !p.isMinor && STAFF_ROLES.includes(p.role)).length;
  const parents = selected.filter((p) => !p.isMinor && p.role === 'parent').length;
  return { hasMinor, ok: staff >= 2 || (staff >= 1 && parents >= 1) };
}

export const MINOR_GROUP_RULE_TEXT =
  'A group with a player under 18 needs two staff adults, or one staff adult and a parent.';

// Mute ---------------------------------------------------------------------------------------

export const MUTE_DURATIONS = ['1h', '8h', '1w', 'forever'] as const;
export type MuteDuration = (typeof MUTE_DURATIONS)[number];
/** "Until I turn it back on": a far-future timestamp, shown as indefinite. */
export const MUTE_FOREVER_ISO = '9999-12-31T00:00:00.000Z';
const MUTE_FOREVER_THRESHOLD = Date.UTC(5000, 0, 1);

export const muteDurationLabel = (d: MuteDuration) =>
  ({ '1h': 'For 1 hour', '8h': 'For 8 hours', '1w': 'For 1 week', forever: 'Until I turn it back on' })[d];

export function muteUntil(d: MuteDuration, now: Date = new Date()): string {
  const hours = { '1h': 1, '8h': 8, '1w': 24 * 7 }[d as '1h' | '8h' | '1w'];
  return d === 'forever' ? MUTE_FOREVER_ISO : new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export const isIndefiniteMute = (mutedUntil: string | null) =>
  mutedUntil !== null && new Date(mutedUntil).getTime() >= MUTE_FOREVER_THRESHOLD;

/** "Muted until 4:30 PM" / "Muted until Mon" / "Muted" (indefinite). Null when not muted. */
export function muteStatusLabel(mutedUntil: string | null, now: Date = new Date(), locale?: string): string | null {
  if (!isMuted(mutedUntil, now)) return null;
  if (isIndefiniteMute(mutedUntil)) return 'Muted';
  const d = new Date(mutedUntil as string);
  return sameDay(d, now)
    ? `Muted until ${timeLabel(d, locale)}`
    : `Muted until ${d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

// Conversation ------------------------------------------------------------------------------

/**
 * Index (into the oldest-first message list) of the first unread message from someone else, or
 * -1. The divider is drawn above it. Nothing is unread if the marker covers the newest message.
 */
export function newMessagesDividerIndex(
  messages: readonly Pick<ChatMessage, 'createdAt' | 'senderId'>[],
  lastReadAt: string | null,
  myId: string | null,
): number {
  return messages.findIndex(
    (m) => m.senderId !== myId && (lastReadAt === null || m.createdAt > lastReadAt),
  );
}

export const MESSAGE_COUNTER_THRESHOLD = 3800;

/** Characters left, shown from 3,800; null below the threshold. Negative means over the limit. */
export const characterCounter = (length: number): number | null =>
  length >= MESSAGE_COUNTER_THRESHOLD ? MAX_MESSAGE_LENGTH - length : null;

/**
 * Non-staff only see messages from when they joined. The notice shows when they joined after the
 * thread started (so earlier messages exist that they cannot see).
 */
export const joinedLateNotice = (isStaff: boolean, joinedAt: string | null, threadCreatedAt: string | null) =>
  !isStaff && joinedAt !== null && threadCreatedAt !== null && joinedAt > threadCreatedAt;

// Attachments -------------------------------------------------------------------------------

export type AttachmentProblem = 'too_many' | 'too_large' | 'bad_type' | 'empty';

export const ATTACHMENT_LIMITS_TEXT = 'Up to 5 files, 10 MB each. JPEG, PNG, WebP, GIF or PDF.';

export function validateAttachment(
  file: { type: string; size: number },
  alreadyAttached: number,
): AttachmentProblem | null {
  if (alreadyAttached >= MAX_ATTACHMENTS_PER_MESSAGE) return 'too_many';
  if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) return 'bad_type';
  if (file.size <= 0) return 'empty';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'too_large';
  return null;
}

export const attachmentProblemText = (p: AttachmentProblem) =>
  ({
    too_many: 'You can attach up to 5 files.',
    too_large: 'That file is over 10 MB.',
    bad_type: 'Only JPEG, PNG, WebP, GIF and PDF files can be attached.',
    empty: 'That file is empty.',
  })[p];

// Places -------------------------------------------------------------------------------------


/** The teams whose conversations appear in the inbox (every team the person is in). */
export const messagingTeams = (contexts: readonly AppContext[]) =>
  contexts.filter((c) => c.kind === 'team');

/** A player 13 to 17 only: a player role and nothing else on any team (no chips, search only). */
export const isPlayerOnly = (contexts: readonly AppContext[]) => {
  const teams = messagingTeams(contexts);
  return teams.length > 0 && teams.every((t) => t.roles.every((r) => r === 'player'));
};

/** Staff of at least one team (can start groups and announcements). */
export const isStaffAnywhere = (contexts: readonly AppContext[]) =>
  messagingTeams(contexts).some((t) => t.roles.some((r) => r === 'admin' || r === 'coach' || r === 'manager'));

/** 'image' or 'pdf' for an attachment mime type (anything else is treated as a file). */
export const getAttachmentKind = (mime: string): 'image' | 'pdf' | 'file' =>
  mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'file';
