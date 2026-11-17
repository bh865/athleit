/**
 * Pure messaging logic shared by web and mobile: grouping into runs, day labels, delivery
 * status, optimistic-send merging and screen-reader labels. No I/O, no React.
 */

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
