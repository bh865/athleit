import { describe, expect, it } from 'vitest';
import {
  attachmentProblemText, characterCounter, draftPreview, featuredAnnouncement, filterInbox,
  findDirectThread, groupComposePeople, inboxPreview, inboxRowFromDb, isArchivedForMe,
  isIndefiniteMute, isMuted, joinedLateNotice, minorGroupCheck, muteStatusLabel, muteUntil,
  newMessagesDividerIndex, rowStatus, searchInbox, shouldSearchServer, showFilterChips,
  showTeamChip, sortInbox, validateAttachment, threadTitle, composeReasonText,
  type InboxRow, type RawInboxRow,
} from './messaging';

const NOW = new Date('2026-11-20T15:00:00.000Z');
const ME = 'me';

const row = (o: Partial<InboxRow> = {}): InboxRow => ({
  threadId: 't1', type: 'group', title: 'Bus times', archivedAt: null,
  lastMessageAt: '2026-11-20T14:00:00.000Z', lastMessageId: 'm1', lastBody: 'See you at 5', lastSenderId: 'sam',
  lastSenderName: 'Sam Lee', lastDeleted: false, lastHidden: false,
  lastCreatedAt: '2026-11-20T14:00:00.000Z', unreadCount: 0, memberCount: 4, otherName: null,
  otherProfileId: null, mutedUntil: null, teamId: 'A', teamName: 'Team A', sport: 'soccer',
  pinnedAt: null, archivedForMe: false, lastReadCount: null, lastReadTotal: null, ...o,
});

describe('inboxRowFromDb', () => {
  it('camelCases and defaults nullable flags', () => {
    const raw = {
      thread_id: 'x', type: 'direct', title: null, archived_at: null, last_message_at: 'a', last_message_id: 'm',
      last_body: 'hi', last_sender_id: 's', last_sender_name: 'S', last_deleted: null,
      last_hidden: null, last_created_at: 'a', unread_count: 2, member_count: 2,
      other_name: 'O', other_profile_id: 'p', muted_until: null, team_id: 'A', team_name: 'T',
      sport: 'soccer', pinned_at: null, archived_for_me: null, last_read_count: null,
      last_read_total: null,
    } satisfies RawInboxRow;
    const r = inboxRowFromDb(raw);
    expect(r.otherProfileId).toBe('p');
    expect(r.lastDeleted).toBe(false);
    expect(r.archivedForMe).toBe(false);
  });
});

describe('archive and mute', () => {
  it('archived for me until the next message', () => {
    expect(isArchivedForMe('2026-11-20T10:00:00Z', '2026-11-20T09:00:00Z')).toBe(true);
    expect(isArchivedForMe('2026-11-20T10:00:00Z', '2026-11-20T10:00:01Z')).toBe(false);
    expect(isArchivedForMe(null, '2026-11-20T10:00:00Z')).toBe(false);
  });
  it('computes muted_until from the clock', () => {
    expect(muteUntil('1h', NOW)).toBe('2026-11-20T16:00:00.000Z');
    expect(muteUntil('8h', NOW)).toBe('2026-11-20T23:00:00.000Z');
    expect(muteUntil('1w', NOW)).toBe('2026-11-27T15:00:00.000Z');
    expect(isIndefiniteMute(muteUntil('forever', NOW))).toBe(true);
    expect(isIndefiniteMute(muteUntil('1w', NOW))).toBe(false);
  });
  it('labels mute status', () => {
    expect(isMuted(muteUntil('1h', NOW), NOW)).toBe(true);
    expect(isMuted('2026-11-20T14:00:00Z', NOW)).toBe(false);
    expect(muteStatusLabel(null, NOW)).toBeNull();
    expect(muteStatusLabel(muteUntil('forever', NOW), NOW)).toBe('Muted');
    expect(muteStatusLabel(muteUntil('1h', NOW), NOW, 'en-US')).toMatch(/^Muted until /);
  });
});

describe('previews', () => {
  it('prefixes You and first names', () => {
    expect(inboxPreview(row({ lastSenderId: ME }), ME)).toBe('You: See you at 5');
    expect(inboxPreview(row(), ME)).toBe('Sam: See you at 5');
    expect(inboxPreview(row({ type: 'direct' }), ME)).toBe('See you at 5');
    expect(inboxPreview(row({ type: 'announcement' }), ME)).toBe('Sam: See you at 5');
  });
  it('handles removed, deleted and empty', () => {
    expect(inboxPreview(row({ lastHidden: true }), ME)).toBe('Removed by staff');
    expect(inboxPreview(row({ lastDeleted: true }), ME)).toBe('Message deleted');
    expect(inboxPreview(row({ lastCreatedAt: null, lastBody: null }), ME)).toBe('No messages yet');
  });
  it('titles direct threads by the other person', () => {
    expect(threadTitle(row({ type: 'direct', otherName: 'Pat' }))).toBe('Pat');
    expect(draftPreview('  hello   there ')).toBe('Draft: hello there');
  });
});

describe('rowStatus priority', () => {
  const base = { hasFailed: false, draft: null, inArchivedFilter: false, now: NOW };
  it('failed beats unread beats draft beats muted beats archived', () => {
    const r = row({ unreadCount: 2, mutedUntil: null, archivedForMe: true });
    expect(rowStatus(r, { ...base, hasFailed: true, draft: 'x' })).toBe('failed');
    expect(rowStatus(r, { ...base, draft: 'x' })).toBe('unread');
    expect(rowStatus(row(), { ...base, draft: 'x' })).toBe('draft');
    const muted = row({ mutedUntil: muteUntil('1w', NOW), unreadCount: 3 });
    expect(rowStatus(muted, base)).toBe('muted');
    expect(rowStatus(row({ archivedForMe: true }), { ...base, inArchivedFilter: true })).toBe('archived');
    expect(rowStatus(row({ archivedForMe: true }), base)).toBe('none');
  });
});

describe('chips and filters', () => {
  it('team chip and filter chip rules', () => {
    expect(showTeamChip(2, false)).toBe(true);
    expect(showTeamChip(1, false)).toBe(false);
    expect(showTeamChip(3, true)).toBe(false);
    expect(showFilterChips(true)).toBe(false);
  });
  const rows = [
    row({ threadId: '1', unreadCount: 2 }),
    row({ threadId: '2', type: 'announcement', unreadCount: 1, teamId: 'B' }),
    row({ threadId: '3', archivedForMe: true }),
    row({ threadId: '4', archivedAt: '2026-11-01T00:00:00Z' }),
    row({ threadId: '5', unreadCount: 4, mutedUntil: muteUntil('1w', NOW) }),
  ];
  it('filters', () => {
    const ids = (f: Parameters<typeof filterInbox>[1]) => filterInbox(rows, f, NOW).map((r) => r.threadId);
    expect(ids({ kind: 'all' })).toEqual(['1', '2', '5']);
    expect(ids({ kind: 'unread' })).toEqual(['1', '2']);
    expect(ids({ kind: 'announcements' })).toEqual(['2']);
    expect(ids({ kind: 'team', teamId: 'B' })).toEqual(['2']);
    expect(ids({ kind: 'archived' })).toEqual(['3', '4']);
  });
  it('sorts pinned first then newest, and finds the featured announcement', () => {
    const s = sortInbox([
      row({ threadId: 'old', lastMessageAt: '2026-11-01T00:00:00Z' }),
      row({ threadId: 'new', lastMessageAt: '2026-11-20T00:00:00Z' }),
      row({ threadId: 'pin', lastMessageAt: '2026-10-01T00:00:00Z', pinnedAt: '2026-11-02T00:00:00Z' }),
    ]);
    expect(s.map((r) => r.threadId)).toEqual(['pin', 'new', 'old']);
    expect(featuredAnnouncement(rows, NOW)?.threadId).toBe('2');
    expect(featuredAnnouncement([row()], NOW)).toBeNull();
  });
  it('searches names, people, teams and previews, accent-insensitive', () => {
    expect(searchInbox([row({ title: 'Café run' })], 'cafe', ME)).toHaveLength(1);
    expect(searchInbox([row()], 'team a', ME)).toHaveLength(1);
    expect(searchInbox([row()], 'zzz', ME)).toHaveLength(0);
    expect(searchInbox([row()], '  ', ME)).toHaveLength(1);
    expect(shouldSearchServer('ab')).toBe(false);
    expect(shouldSearchServer('abc')).toBe(true);
  });
});

describe('compose', () => {
  const people = (ids: string[]) =>
    ids.map((id) => ({ profileId: id, displayName: id.toUpperCase(), role: 'coach', isMinor: false, canDirect: true, reason: null }));
  it('groups by team, lists a person under each team and matches an existing direct thread', () => {
    const rows = [row({ type: 'direct', teamId: 'A', otherProfileId: 'x' })];
    const g = groupComposePeople(
      [
        { teamId: 'A', teamName: 'A', people: people(['x', 'y']) },
        { teamId: 'B', teamName: 'B', people: people(['x']) },
      ],
      rows,
      '',
    );
    expect(g.map((t) => t.people.map((p) => p.existingThreadId))).toEqual([['t1', null], [null]]);
    expect(findDirectThread(rows, 'B', 'x')).toBeNull();
    expect(groupComposePeople([{ teamId: 'A', teamName: 'A', people: people(['x', 'y']) }], [], 'y')[0]!.people).toHaveLength(1);
    expect(groupComposePeople([{ teamId: 'A', teamName: 'A', people: people(['x']) }], [], 'q')).toEqual([]);
  });
  it('explains disabled rows', () => {
    expect(composeReasonText('direct_minor_guardian_only')).toMatch(/parent or guardian/);
    expect(composeReasonText(null)).toBeNull();
  });
  it('mirrors the minor group rule', () => {
    const m = { role: 'player', isMinor: true };
    const parent = { role: 'parent', isMinor: false };
    const coach = { role: 'coach', isMinor: false };
    expect(minorGroupCheck([parent, parent])).toEqual({ hasMinor: false, ok: true });
    expect(minorGroupCheck([m])).toEqual({ hasMinor: true, ok: false });
    expect(minorGroupCheck([m, parent]).ok).toBe(true);
    expect(minorGroupCheck([m, coach]).ok).toBe(true);
  });
});

describe('conversation', () => {
  const msgs = [
    { createdAt: '2026-11-20T10:00:00Z', senderId: 'a' },
    { createdAt: '2026-11-20T11:00:00Z', senderId: ME },
    { createdAt: '2026-11-20T12:00:00Z', senderId: 'a' },
  ];
  it('places the new-messages divider above the first unread from someone else', () => {
    expect(newMessagesDividerIndex(msgs, '2026-11-20T10:30:00Z', ME)).toBe(2);
    expect(newMessagesDividerIndex(msgs, null, ME)).toBe(0);
    expect(newMessagesDividerIndex(msgs, '2026-11-20T12:00:00Z', ME)).toBe(-1);
  });
  it('shows the character counter from 3,800', () => {
    expect(characterCounter(3799)).toBeNull();
    expect(characterCounter(3800)).toBe(200);
    expect(characterCounter(4010)).toBe(-10);
  });
  it('joined-late notice is for non-staff who joined after the thread began', () => {
    expect(joinedLateNotice(false, '2026-11-10', '2026-11-01')).toBe(true);
    expect(joinedLateNotice(true, '2026-11-10', '2026-11-01')).toBe(false);
    expect(joinedLateNotice(false, '2026-11-01', '2026-11-01')).toBe(false);
    expect(joinedLateNotice(false, null, '2026-11-01')).toBe(false);
  });
});

describe('attachments', () => {
  it('enforces the storage limits client-side', () => {
    expect(validateAttachment({ type: 'image/png', size: 100 }, 0)).toBeNull();
    expect(validateAttachment({ type: 'image/png', size: 100 }, 5)).toBe('too_many');
    expect(validateAttachment({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }, 0)).toBe('too_large');
    expect(validateAttachment({ type: 'image/heic', size: 100 }, 0)).toBe('bad_type');
    expect(validateAttachment({ type: 'application/pdf', size: 0 }, 0)).toBe('empty');
    expect(attachmentProblemText('too_large')).toMatch(/10 MB/);
  });
});
