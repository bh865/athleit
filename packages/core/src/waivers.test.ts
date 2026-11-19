import { describe, expect, it } from 'vitest';

import {
  WAIVER_MAX_CHARS,
  WAIVER_TEMPLATES,
  categoryCounts,
  changeSummary,
  diffWords,
  documentAbilities,
  documentPath,
  fileKind,
  filterDocuments,
  insertBlock,
  matchesComplianceFilter,
  normalizeWaiverStatus,
  paragraphs,
  progressSegments,
  remindable,
  resignDays,
  resignPreset,
  resignSentence,
  safeFileName,
  splitPinned,
  summarizeCompliance,
  titleFromFile,
  validateUpload,
  validateUploads,
  waiverIssues,
} from './waivers';

const row = (player: string, waiver: string, status: string) => ({
  player_id: player,
  first_name: player.toUpperCase(),
  last_name: 'L',
  waiver_id: waiver,
  waiver_title: waiver === 'w1' ? 'Liability' : 'Photo',
  status,
  accepted_at: null,
});

describe('compliance', () => {
  it('maps the database statuses to what the screens say', () => {
    expect(normalizeWaiverStatus('current')).toBe('signed');
    expect(normalizeWaiverStatus('missing')).toBe('missing');
    expect(normalizeWaiverStatus('expired')).toBe('expired');
    expect(normalizeWaiverStatus('outdated')).toBe('expired');
  });
  const rows = [
    row('a', 'w1', 'current'),
    row('b', 'w1', 'missing'),
    row('c', 'w1', 'outdated'),
    row('a', 'w2', 'current'),
    row('b', 'w2', 'current'),
  ];
  it('groups by waiver with signed counts, worst first, and totals', () => {
    const s = summarizeCompliance(rows);
    expect(s).toMatchObject({
      signed: 3,
      expired: 1,
      missing: 1,
      total: 5,
      players: 3,
      waivers: 2,
      playersNeedingAttention: 2,
    });
    const g = s.groups.find((x) => x.waiverId === 'w1')!;
    expect(g).toMatchObject({ signed: 1, total: 3 });
    expect(g.rows.map((r) => r.state)).toEqual(['missing', 'expired', 'signed']);
  });
  it('gives bar segments that sum to 100', () => {
    const s = summarizeCompliance(rows);
    const p = progressSegments(s);
    expect(p.signed + p.expired + p.missing).toBe(100);
    expect(progressSegments({ signed: 0, expired: 0, missing: 0, total: 0 })).toEqual({
      signed: 0,
      expired: 0,
      missing: 0,
    });
  });
  it('filters needing attention', () => {
    expect(matchesComplianceFilter('missing', 'needs')).toBe(true);
    expect(matchesComplianceFilter('signed', 'needs')).toBe(false);
    expect(matchesComplianceFilter('signed', 'all')).toBe(true);
  });
});

describe('reminder rate limit', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const rows = [
    { player_id: 'a', waiver_id: 'w', state: 'missing' as const },
    { player_id: 'b', waiver_id: 'w', state: 'expired' as const },
    { player_id: 'c', waiver_id: 'w', state: 'signed' as const },
  ];
  it('skips signed players and anyone reminded in the last 24 hours', () => {
    const last = new Map([
      ['a:w', '2026-11-18T01:00:00Z'], // 11h ago: too soon
      ['b:w', '2026-11-17T11:00:00Z'], // 25h ago: fine
    ]);
    expect(remindable(rows, last, now).map((r) => r.player_id)).toEqual(['b']);
  });
  it('allows everyone when nobody was reminded', () => {
    expect(remindable(rows, new Map(), now).map((r) => r.player_id)).toEqual(['a', 'b']);
  });
});

describe('re-sign interval', () => {
  it('maps presets to days and back', () => {
    expect(resignDays('never', 30)).toBeNull();
    expect(resignDays('6m', null)).toBe(182);
    expect(resignDays('1y', null)).toBe(365);
    expect(resignDays('custom', 90)).toBe(90);
    expect(resignDays('custom', 0)).toBeNull();
    expect(resignDays('custom', 99999)).toBeNull();
    expect(resignPreset(null)).toBe('never');
    expect(resignPreset(182)).toBe('6m');
    expect(resignPreset(365)).toBe('1y');
    expect(resignPreset(90)).toBe('custom');
  });
  it('explains it', () => {
    expect(resignSentence(365)).toBe(
      'Parents are asked to sign again 1 year after they last signed.',
    );
    expect(resignSentence(null)).toMatch(/does not expire/);
    expect(resignSentence(1)).toMatch(/1 day /);
  });
});

describe('writing helpers', () => {
  it('splits paragraphs on blank lines', () => {
    expect(paragraphs('a\n\nb\n\n\n c ')).toEqual(['a', 'b', 'c']);
  });
  it('inserts a block on its own paragraph', () => {
    expect(insertBlock('One.\n\nTwo.', 5, 'Heading').body).toBe('One.\n\nHeading\n\nTwo.');
    expect(insertBlock('', 0, 'Heading')).toEqual({ body: 'Heading', caret: 7 });
    expect(insertBlock('One.', 4, 'Initials: ____').body).toBe('One.\n\nInitials: ____');
  });
  it('lists what blocks publishing', () => {
    expect(waiverIssues('', '')).toEqual(['Add a title.', 'Add the waiver text.']);
    expect(waiverIssues('T', 'x'.repeat(WAIVER_MAX_CHARS + 1))).toHaveLength(1);
    expect(waiverIssues('T', 'Body')).toEqual([]);
  });
  it('ships two starter templates with text', () => {
    expect(WAIVER_TEMPLATES).toHaveLength(2);
    for (const t of WAIVER_TEMPLATES) expect(waiverIssues(t.title, t.body)).toEqual([]);
  });
});

describe('diff', () => {
  const v3 = 'I give permission for practices, games and team events.\n\nSecond paragraph.';
  const draft =
    'I give permission for practices, games, tournaments and team events.\n\nSecond paragraph.';
  it('marks only the changed words and round-trips both texts', () => {
    const ops = diffWords(v3, draft);
    expect(
      ops
        .filter((o) => o.type === 'add')
        .map((o) => o.text.trim())
        .join(' '),
    ).toContain('tournaments');
    expect(
      ops
        .filter((o) => o.type !== 'add')
        .map((o) => o.text)
        .join(''),
    ).toBe(v3);
    expect(
      ops
        .filter((o) => o.type !== 'del')
        .map((o) => o.text)
        .join(''),
    ).toBe(draft);
  });
  it('reports identical text as one unchanged run', () => {
    expect(diffWords('same text', 'same text')).toEqual([{ type: 'same', text: 'same text' }]);
  });
  it('summarizes changed lines', () => {
    expect(changeSummary(v3, draft)).toBe('1 line changed');
    expect(changeSummary(v3, v3)).toBe('No changes');
    expect(changeSummary('a', 'a\n\nb\n\nc')).toBe('2 lines changed');
  });
});

describe('document upload validation', () => {
  const pdf = { name: 'Rules.pdf', type: 'application/pdf', size: 412_000 };
  it('accepts allowed types under the limit', () => {
    expect(validateUpload(pdf)).toBeNull();
    expect(validateUpload({ ...pdf, type: 'image/png' })).toBeNull();
  });
  it('refuses unsupported types and files over 20 MB', () => {
    expect(validateUpload({ ...pdf, name: 'roster.exe', type: 'application/x-msdownload' })).toBe(
      'Not supported. Use PDF, images or Office files.',
    );
    expect(validateUpload({ ...pdf, size: 48 * 1_048_576 })).toBe('Over the 20 MB limit (48 MB)');
    expect(validateUpload({ ...pdf, size: 20 * 1_048_576 })).toBeNull();
    expect(validateUpload({ ...pdf, size: 0 })).toBe('This file is empty.');
  });
  it('checks several files at once and keeps the good ones', () => {
    const r = validateUploads([
      pdf,
      { name: 'a.mov', type: 'video/quicktime', size: 5 },
      { ...pdf, name: 'b.pdf' },
    ]);
    expect(r.ok.map((f) => f.name)).toEqual(['Rules.pdf', 'b.pdf']);
    expect(r.checked.filter((c) => c.error)).toHaveLength(1);
  });
  it('keeps the storage path convention', () => {
    expect(documentPath({ teamId: 't1' }, 'u-u', 'Fall Rules (v2).pdf')).toBe(
      'team/t1/u-u/Fall_Rules_v2_.pdf',
    );
    expect(documentPath({ clubId: 'c1' }, 'u', 'a.pdf')).toBe('club/c1/u/a.pdf');
    expect(safeFileName('')).toBe('file');
    expect(titleFromFile('Fall Rules.pdf')).toBe('Fall Rules');
  });
  it('names file kinds', () => {
    expect(fileKind('application/pdf')).toBe('pdf');
    expect(fileKind('image/png')).toBe('image');
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'sheet',
    );
  });
});

describe('document library', () => {
  const d = (id: string, category: string, visibility: string, pinned: boolean, at: string) => ({
    id,
    title: id,
    category,
    visibility,
    pinned,
    created_at: at,
  });
  const docs = [
    d('Rules A', 'rules', 'team_members', true, '2026-11-12'),
    d('Plan', 'schedule', 'staff_only', false, '2026-11-16'),
    d('Map', 'schedule', 'team_members', false, '2026-11-03'),
  ];
  it('counts categories', () => {
    const c = categoryCounts(docs);
    expect(c[0]).toEqual({ value: 'all', label: 'All', count: 3 });
    expect(c.find((x) => x.value === 'schedule')?.count).toBe(2);
  });
  it('filters by category, visibility and search', () => {
    expect(
      filterDocuments(docs, { category: 'schedule', visibility: 'all', search: '' }),
    ).toHaveLength(2);
    expect(
      filterDocuments(docs, { category: 'all', visibility: 'staff_only', search: '' }).map(
        (x) => x.id,
      ),
    ).toEqual(['Plan']);
    expect(
      filterDocuments(docs, { category: 'all', visibility: 'all', search: 'MAP' }),
    ).toHaveLength(1);
  });
  it('leads with pinned and sorts newest first', () => {
    const s = splitPinned(docs);
    expect(s.pinned.map((x) => x.id)).toEqual(['Rules A']);
    expect(s.rest.map((x) => x.id)).toEqual(['Plan', 'Map']);
  });
  it('gives read-only people no management abilities', () => {
    expect(documentAbilities(new Set(['documents.view']))).toEqual({
      view: true,
      upload: false,
      edit: false,
      archive: false,
      seeVisibility: false,
    });
    expect(documentAbilities(new Set(['documents.view', 'documents.manage']))).toMatchObject({
      upload: true,
      edit: true,
      archive: true,
      seeVisibility: true,
    });
    expect(documentAbilities(new Set())).toMatchObject({ view: false });
  });
});
