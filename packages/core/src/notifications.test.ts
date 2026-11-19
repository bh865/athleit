import { describe, expect, it } from 'vitest';

import {
  inQuietHours,
  isRecentNotification,
  notificationSummary,
  relativeTime,
  summarizePreferences,
} from './notifications';

describe('notificationSummary', () => {
  it('never exposes message text and links to the thread', () => {
    const s = notificationSummary('messages', {
      title: 'Game day',
      sender_name: 'Casey',
      thread_id: 't1',
    });
    expect(s).toEqual({
      title: 'Game day',
      detail: 'New message from Casey',
      icon: 'chat-circle',
      href: '/messages/t1',
    });
  });
  it('covers announcements and schedule changes', () => {
    expect(notificationSummary('announcements', { thread_id: 't2' }).icon).toBe('megaphone');
    expect(
      notificationSummary('schedule', { event_id: 'e1', change: 'cancelled', title: 'Practice' }),
    ).toMatchObject({
      detail: 'Event cancelled',
      href: '/events/e1',
    });
  });
});

describe('time helpers', () => {
  const now = new Date('2026-03-10T15:00:00Z');
  it('formats relative times', () => {
    expect(relativeTime('2026-03-10T14:59:50Z', now)).toBe('now');
    expect(relativeTime('2026-03-10T14:30:00Z', now)).toBe('30m');
    expect(relativeTime('2026-03-10T10:00:00Z', now)).toBe('5h');
    expect(relativeTime('2026-03-08T15:00:00Z', now)).toBe('2d');
  });
  it('marks recent notifications', () => {
    expect(isRecentNotification('2026-03-10T14:30:00Z', '2026-03-10T14:31:00Z', now)).toBe(true);
    expect(isRecentNotification('2026-03-09T14:30:00Z', '2026-03-09T14:31:00Z', now)).toBe(false);
    expect(isRecentNotification('2026-03-09T14:30:00Z', null, now)).toBe(true);
  });
});

describe('inQuietHours', () => {
  it('handles windows that cross midnight, in the user timezone', () => {
    // 03:00Z is 22:00 in New York (EST, UTC-5)
    expect(
      inQuietHours(new Date('2026-01-15T03:00:00Z'), '21:00', '07:00', 'America/New_York'),
    ).toBe(true);
    expect(
      inQuietHours(new Date('2026-01-15T15:00:00Z'), '21:00', '07:00', 'America/New_York'),
    ).toBe(false);
    expect(inQuietHours(new Date('2026-01-15T14:00:00Z'), '13:00', '15:00', 'UTC')).toBe(true);
    expect(inQuietHours(new Date('2026-01-15T14:00:00Z'), null, null, 'UTC')).toBe(false);
  });
});

describe('summarizePreferences', () => {
  it('defaults to enabled and reads shared quiet hours', () => {
    const rows = [
      {
        channel: 'push',
        category: 'messages',
        enabled: false,
        quiet_hours_start: '21:00:00',
        quiet_hours_end: '07:00:00',
        timezone: 'America/Chicago',
        include_preview: true,
      },
    ];
    const s = summarizePreferences(rows);
    expect(s.get('push', 'messages')).toBe(false);
    expect(s.get('email', 'schedule')).toBe(true);
    expect([s.quietStart, s.quietEnd, s.timezone, s.preview]).toEqual([
      '21:00',
      '07:00',
      'America/Chicago',
      true,
    ]);
  });
});

describe('registration notifications', () => {
  it('opens the management screen for staff digests', () => {
    const s = notificationSummary('registration', {
      title: 'Spring',
      body: '2 new registrations',
      registration_event_id: 'e1',
    });
    expect(s.href).toBe('/manage/registration/e1');
    expect(s.icon).toBe('clipboard-text');
  });
  it('sends staff waiver notices to the tracker and families to their registrations', () => {
    expect(notificationSummary('registration', { team_id: 't1', audience: 'staff' }).href).toBe(
      '/teams/t1/waivers',
    );
    expect(notificationSummary('registration', { team_id: 't1', audience: 'family' }).href).toBe(
      '/registrations',
    );
    expect(notificationSummary('registration', {}).href).toBe('/registrations');
  });
});
