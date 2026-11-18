import { describe, expect, it } from 'vitest';

import { friendlyError } from './errors';
import {
  createThreadSchema,
  notificationPreferenceSchema,
  registerPushDeviceSchema,
  sendMessageSchema,
} from './schemas/messaging';

const id = '11111111-1111-4111-8111-111111111111';

describe('sendMessageSchema', () => {
  it('trims and accepts a normal message', () => {
    expect(sendMessageSchema.parse({ thread_id: id, body: '  hi  ' }).body).toBe('hi');
  });
  it('rejects an empty message without attachments but allows attachment-only', () => {
    expect(sendMessageSchema.safeParse({ thread_id: id, body: '  ' }).success).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        thread_id: id,
        body: '',
        attachments: [
          { storage_path: `${id}/a/b.pdf`, mime_type: 'application/pdf', size_bytes: 5 },
        ],
      }).success,
    ).toBe(true);
  });
  it('rejects over-long bodies, big or unsupported attachments', () => {
    expect(sendMessageSchema.safeParse({ thread_id: id, body: 'x'.repeat(4001) }).success).toBe(
      false,
    );
    const att = { storage_path: 'p', mime_type: 'application/zip', size_bytes: 1 };
    expect(
      sendMessageSchema.safeParse({ thread_id: id, body: 'x', attachments: [att] }).success,
    ).toBe(false);
    const big = { storage_path: 'p', mime_type: 'image/png', size_bytes: 11 * 1024 * 1024 };
    expect(
      sendMessageSchema.safeParse({ thread_id: id, body: 'x', attachments: [big] }).success,
    ).toBe(false);
  });
});

describe('createThreadSchema', () => {
  it('needs a title for groups and announcements, exactly one person for direct', () => {
    expect(
      createThreadSchema.safeParse({ team_id: id, type: 'group', participant_ids: [id] }).success,
    ).toBe(false);
    expect(
      createThreadSchema.safeParse({
        team_id: id,
        type: 'group',
        title: 'T',
        participant_ids: [id],
      }).success,
    ).toBe(true);
    expect(
      createThreadSchema.safeParse({ team_id: id, type: 'announcement', title: 'News' }).success,
    ).toBe(true);
    expect(
      createThreadSchema.safeParse({ team_id: id, type: 'direct', participant_ids: [] }).success,
    ).toBe(false);
    expect(
      createThreadSchema.safeParse({ team_id: id, type: 'direct', participant_ids: [id] }).success,
    ).toBe(true);
  });
});

describe('notificationPreferenceSchema', () => {
  const base = {
    channel: 'push',
    category: 'messages',
    enabled: true,
    timezone: 'UTC',
    include_preview: false,
  };
  it('needs both quiet-hour ends or neither', () => {
    expect(
      notificationPreferenceSchema.safeParse({
        ...base,
        quiet_hours_start: null,
        quiet_hours_end: null,
      }).success,
    ).toBe(true);
    expect(
      notificationPreferenceSchema.safeParse({
        ...base,
        quiet_hours_start: '21:00',
        quiet_hours_end: null,
      }).success,
    ).toBe(false);
    expect(
      notificationPreferenceSchema.safeParse({
        ...base,
        quiet_hours_start: '21:00',
        quiet_hours_end: '07:00',
      }).success,
    ).toBe(true);
  });
  it('does not accept reserved channels or categories', () => {
    expect(
      notificationPreferenceSchema.safeParse({
        ...base,
        channel: 'sms_reserved',
        quiet_hours_start: null,
        quiet_hours_end: null,
      }).success,
    ).toBe(false);
    expect(
      notificationPreferenceSchema.safeParse({
        ...base,
        category: 'payments_reserved',
        quiet_hours_start: null,
        quiet_hours_end: null,
      }).success,
    ).toBe(false);
  });
});

describe('registerPushDeviceSchema', () => {
  it('validates Expo and web tokens', () => {
    expect(
      registerPushDeviceSchema.safeParse({ platform: 'ios', token: 'ExponentPushToken[abcdefgh]' })
        .success,
    ).toBe(true);
    expect(
      registerPushDeviceSchema.safeParse({ platform: 'ios', token: 'garbage-token-value' }).success,
    ).toBe(false);
    expect(
      registerPushDeviceSchema.safeParse({
        platform: 'web',
        token: 'https://push.example.com/abc',
        subscription: { p256dh: 'a', auth: 'b' },
      }).success,
    ).toBe(true);
    expect(
      registerPushDeviceSchema.safeParse({ platform: 'web', token: 'https://push.example.com/abc' })
        .success,
    ).toBe(false);
  });
});

describe('friendlyError (messaging)', () => {
  it('explains the safety rules in plain language', () => {
    expect(friendlyError({ message: 'direct_minor_guardian_only' })).toMatch(/parent or guardian/);
    expect(friendlyError({ message: 'minor_group_needs_two_adults' })).toMatch(/two coaches/);
    expect(friendlyError({ message: 'rate_limited' })).toMatch(/too quickly/);
  });
});

describe('registration errors', () => {
  it('says what to do instead of a generic check message', () => {
    const e = (message: string) => friendlyError({ message, code: '23514' });
    expect(e('window_required')).toMatch(/opens and closes/);
    expect(e('required_waivers_missing')).toMatch(/waivers/);
    expect(e('payments_not_ready')).toMatch(/payout/);
  });
});
