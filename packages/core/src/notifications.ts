/** Shared notification presentation helpers (in-app centre, toasts) and preference logic. */
export interface InAppPayload {
  kind?: string;
  title?: string;
  sender_name?: string | null;
  thread_id?: string;
  event_id?: string;
  change?: string;
  body?: string;
  sensitive?: boolean;
  request_id?: string | null;
  installment_id?: string | null;
  payment_event_id?: string;
  team_id?: string | null;
  club_id?: string | null;
  audience?: string;
  registration_event_id?: string;
}

const CHANGE_LABEL: Record<string, string> = {
  created: 'New event',
  time_changed: 'Time changed',
  location_changed: 'Location changed',
  cancelled: 'Event cancelled',
};

/** Title, detail line and icon for the alerts list. Never includes message text. */
export function notificationSummary(
  category: string,
  p: InAppPayload,
): {
  title: string;
  detail: string;
  icon: 'calendar-blank' | 'megaphone' | 'chat-circle' | 'credit-card' | 'clipboard-text';
  href: string;
} {
  const href = p.thread_id
    ? `/messages/${p.thread_id}`
    : p.event_id
      ? `/events/${p.event_id}`
      : '/';
  if (category === 'payments') {
    // Parents open the exact request (or the Pay list); staff open the event's collection.
    const staffBase = p.team_id
      ? `/teams/${p.team_id}/payments`
      : p.club_id
        ? `/clubs/${p.club_id}/payments`
        : '/';
    return {
      title: p.title || 'Payment',
      detail: p.body || 'Payment update',
      icon: 'credit-card',
      href:
        p.audience === 'staff'
          ? `${staffBase}${p.payment_event_id ? `?event=${p.payment_event_id}` : ''}`
          : p.request_id
            ? `/pay?request=${p.request_id}`
            : '/pay',
    };
  }
  if (category === 'registration') {
    // Staff digests open the event's management screen; waiver notices open the tracker (staff) or the family's list.
    return {
      title: p.title || 'Registration',
      detail: p.body || 'Registration update',
      icon: 'clipboard-text',
      href: p.registration_event_id
        ? `/manage/registration/${p.registration_event_id}`
        : p.team_id && p.audience === 'staff'
          ? `/teams/${p.team_id}/waivers`
          : '/registrations',
    };
  }
  if (category === 'schedule') {
    return {
      title: p.title || 'Schedule update',
      detail: p.body || CHANGE_LABEL[p.change ?? ''] || 'Schedule update',
      icon: 'calendar-blank',
      href,
    };
  }
  if (category === 'announcements') {
    return {
      title: p.title || 'Announcement',
      detail: 'New announcement',
      icon: 'megaphone',
      href,
    };
  }
  return {
    title: p.title || p.sender_name || 'New message',
    detail: p.sender_name ? `New message from ${p.sender_name}` : 'New message',
    icon: 'chat-circle',
    href,
  };
}

/** "Recent" notifications (unread, or under an hour old) get the lime circle. */
export const isRecentNotification = (createdAt: string, readAt: string | null, now = new Date()) =>
  readAt === null || now.getTime() - new Date(createdAt).getTime() < 3_600_000;

/** Relative time for the alerts list: "now", "5m", "3h", "2d", else a short date. */
export function relativeTime(iso: string, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Is `now` inside quiet hours (HH:MM[:SS] window, may cross midnight) in `timeZone`? For UI hints only; the database decides delivery. */
export function inQuietHours(
  now: Date,
  start: string | null,
  end: string | null,
  timeZone: string,
): boolean {
  if (!start || !end || start === end) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(now);
  const t = parts.slice(0, 5);
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export interface PreferenceRow {
  channel: string;
  category: string;
  enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  include_preview: boolean;
}

/** Collapse the per-channel/category rows into what the settings screen shows. */
export function summarizePreferences(rows: readonly PreferenceRow[]) {
  const get = (channel: string, category: string) =>
    rows.find((r) => r.channel === channel && r.category === category)?.enabled ?? true;
  const any = rows[0];
  return {
    get,
    quietStart: any?.quiet_hours_start?.slice(0, 5) ?? '',
    quietEnd: any?.quiet_hours_end?.slice(0, 5) ?? '',
    timezone: any?.timezone ?? 'UTC',
    preview:
      rows.find((r) => r.channel === 'push' && r.category === 'messages')?.include_preview ?? false,
  };
}
