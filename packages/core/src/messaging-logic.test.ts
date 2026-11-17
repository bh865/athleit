import { describe, expect, it } from 'vitest';

import {
  deliveryStatus,
  groupMessages,
  isUnread,
  listTimeLabel,
  mergeMessages,
  messageA11yLabel,
  previewOf,
  retryDelayMs,
  type ChatMessage,
} from './messaging';

const NOW = new Date('2026-03-10T15:00:00');
const m = (
  id: string,
  sender: string,
  at: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  senderId: sender,
  senderName: sender.toUpperCase(),
  body: id,
  createdAt: new Date(at).toISOString(),
  ...extra,
});

describe('groupMessages', () => {
  const list = [
    m('a1', 'a', '2026-03-09T10:00:00'),
    m('a2', 'a', '2026-03-09T10:01:00'),
    m('b1', 'b', '2026-03-09T10:02:00'),
    m('a3', 'a', '2026-03-10T09:00:00'),
  ];
  const items = groupMessages(list, 'a', NOW, 'en-US');
  const msgs = items.filter((i) => i.kind === 'message');

  it('inserts a day label per day', () => {
    expect(items.filter((i) => i.kind === 'day').map((i) => i.label)).toEqual([
      'Yesterday',
      'Today',
    ]);
  });
  it('marks first and last of each run', () => {
    expect(msgs.map((i) => [i.firstInRun, i.lastInRun])).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [true, true],
    ]);
  });
  it('flags own messages', () => {
    expect(msgs.map((i) => i.own)).toEqual([true, true, false, true]);
  });
  it('starts a new run after a long gap', () => {
    const g = groupMessages(
      [m('x', 'a', '2026-03-10T09:00:00'), m('y', 'a', '2026-03-10T09:30:00')],
      'a',
      NOW,
    );
    expect(g.filter((i) => i.kind === 'message').map((i) => i.firstInRun)).toEqual([true, true]);
  });
});

describe('mergeMessages', () => {
  it('deduplicates by id and sorts oldest-first', () => {
    const a = m('1', 'a', '2026-03-10T09:00:00');
    const b = m('2', 'a', '2026-03-10T09:01:00');
    expect(mergeMessages([b, a], [a, b]).map((x) => x.id)).toEqual(['1', '2']);
  });
  it('replaces an optimistic message with its confirmed copy (reconnect, no duplicate)', () => {
    const optimistic = m('tmp', 'a', '2026-03-10T09:00:00', {
      clientId: 'c1',
      sendState: 'sending',
    });
    const confirmed = m('real', 'a', '2026-03-10T09:00:01', { clientId: 'c1' });
    const merged = mergeMessages([optimistic], [confirmed]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('real');
    expect(merged[0]!.sendState).toBeUndefined();
  });
  it('keeps a failed optimistic message when nothing confirmed it', () => {
    const failed = m('tmp', 'a', '2026-03-10T09:00:00', { clientId: 'c1', sendState: 'failed' });
    expect(mergeMessages([failed], [])[0]!.sendState).toBe('failed');
  });
});

describe('status and labels', () => {
  const own = m('1', 'a', '2026-03-10T09:00:00');
  it('derives delivery status', () => {
    expect(deliveryStatus({ ...own, sendState: 'sending' }, [])).toBe('Sending');
    expect(deliveryStatus({ ...own, sendState: 'failed' }, [])).toBe('Failed');
    expect(deliveryStatus(own, [null])).toBe('Delivered');
    expect(deliveryStatus(own, [null, new Date('2026-03-10T09:05:00').toISOString()])).toBe('Read');
  });
  it('builds screen-reader labels', () => {
    expect(
      messageA11yLabel(
        { message: { ...own, createdAt: '2026-03-10T16:14:00Z' }, own: true },
        'Read',
        'en-US',
      ),
    ).toMatch(/^You, .*:14.*, read: 1$/);
    expect(
      messageA11yLabel({ message: { ...own, hidden: true }, own: false }, null, 'en-US'),
    ).toMatch(/removed by staff$/);
  });
  it('previews', () => {
    expect(previewOf(null)).toBe('No messages yet');
    expect(previewOf({ body: 'a\n  b', deleted: false, hidden: false })).toBe('a b');
    expect(previewOf({ body: 'x', hidden: true })).toBe('Removed by staff');
  });
  it('unread logic', () => {
    const last = { createdAt: '2026-03-10T09:00:00Z', senderId: 'b' };
    expect(isUnread(last, 'a', null)).toBe(true);
    expect(isUnread(last, 'a', '2026-03-10T09:00:00Z')).toBe(false);
    expect(isUnread({ ...last, senderId: 'a' }, 'a', null)).toBe(false);
    expect(isUnread(null, 'a', null)).toBe(false);
  });
  it('list time and retry backoff', () => {
    expect(listTimeLabel(new Date('2026-03-09T12:00:00').toISOString(), NOW, 'en-US')).toBe(
      'Yesterday',
    );
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(10)).toBe(30000);
  });
});
