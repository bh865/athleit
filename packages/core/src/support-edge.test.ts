import { describe, expect, it, vi } from 'vitest';

import {
  drainEmails,
  finalizeAttachments,
  replyByToken,
  submitPublic,
  viewByToken,
  type SubmitDeps,
  type SupportSettings,
} from '../../../supabase/functions/_shared/support/core';
import {
  holdReason,
  loggableMiss,
  sniffMime,
  validateSubmission,
} from '../../../supabase/functions/_shared/support/rules';

const settings: SupportSettings = {
  public_tickets_enabled: true,
  max_attachments: 3,
  max_attachment_mb: 10,
  contact_email: null,
};
const good = {
  type: 'question',
  subject: 'Join code',
  body: 'It does not work',
  email: 'A@Example.com',
  captcha_token: 't',
};
const calm = { by_email_24h: 0, known_email: 1, identical_24h: 0 };

const deps = (over: Partial<SubmitDeps> = {}): SubmitDeps => ({
  captcha: async () => ({ ok: true }),
  rateLimit: async () => true,
  settings: async () => settings,
  signals: async () => calm,
  create: vi.fn(async () => ({ id: '11111111-1111-1111-1111-111111111111', ref: 'SUP-001001' })),
  uploadToken: async () => 'tok',
  signUploads: async () => [],
  flushEmails: async () => undefined,
  log: () => undefined,
  ...over,
});

describe('validateSubmission', () => {
  it('normalises and accepts a good request', () => {
    const v = validateSubmission(
      { ...good, diagnostics: { route: '/pay', message_text: 'secret' } },
      3,
      1e7,
    );
    expect(v.ok && v.value.email).toBe('a@example.com');
    expect(v.ok && Object.keys(v.value.diagnostics)).toEqual(['route']); // unknown keys dropped
  });
  it('enforces length, type and email', () => {
    expect(validateSubmission({ ...good, subject: 'x'.repeat(121) }, 3, 1e7)).toMatchObject({
      ok: false,
      error: 'invalid_subject',
    });
    expect(validateSubmission({ ...good, body: 'x'.repeat(5001) }, 3, 1e7)).toMatchObject({
      ok: false,
      error: 'invalid_body',
    });
    expect(validateSubmission({ ...good, type: 'nope' }, 3, 1e7)).toMatchObject({
      ok: false,
      error: 'invalid_type',
    });
    expect(validateSubmission({ ...good, email: 'nope' }, 3, 1e7)).toMatchObject({
      ok: false,
      error: 'invalid_email',
    });
  });
  it('rejects too many, oversized and wrong-type files', () => {
    const f = (o = {}) => ({ name: 'a.png', type: 'image/png', size: 10, ...o });
    expect(validateSubmission({ ...good, files: [f(), f(), f(), f()] }, 3, 1e7)).toMatchObject({
      error: 'too_many_files',
    });
    expect(validateSubmission({ ...good, files: [f({ size: 2e7 })] }, 3, 1e7)).toMatchObject({
      error: 'file_too_large',
    });
    expect(
      validateSubmission({ ...good, files: [f({ type: 'application/zip' })] }, 3, 1e7),
    ).toMatchObject({ error: 'file_type' });
  });
});

describe('holdReason', () => {
  const t = { subject: 's', body: 'hello' };
  it('lets a normal request through', () => expect(holdReason(calm, t)).toBeNull());
  it('holds a new email with a link', () =>
    expect(holdReason({ ...calm, known_email: 0 }, { ...t, body: 'see http://x.test' })).toBe(
      'new_email_with_link',
    ));
  it('holds repeated and bursty submissions', () => {
    expect(holdReason({ ...calm, by_email_24h: 3 }, t)).toBe('many_requests');
    expect(holdReason({ ...calm, identical_24h: 2 }, t)).toBe('repeated_text');
  });
  it('holds blocked words and many links', () => {
    expect(holdReason(calm, { ...t, body: 'best casino' })).toBe('blocked_words');
    expect(holdReason(calm, { ...t, body: 'http://a http://b http://c http://d http://e' })).toBe(
      'many_links',
    );
  });
});

describe('sniffMime and loggableMiss', () => {
  const bytes = (...xs: number[]) => Uint8Array.from([...xs, ...new Array(16).fill(0)]);
  it('reads the real type from magic bytes', () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('application/pdf');
    expect(sniffMime(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip
    expect(sniffMime(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
  it('drops queries that could identify a person', () => {
    expect(loggableMiss('Join Code')).toBe('join code');
    expect(loggableMiss('me@example.com')).toBeNull();
    expect(loggableMiss('4242 4242 4242 4242')).toBeNull();
    expect(loggableMiss('x')).toBeNull();
  });
});

describe('submitPublic', () => {
  it('refuses when public tickets are off', async () => {
    const r = await submitPublic(
      deps({ settings: async () => ({ ...settings, public_tickets_enabled: false }) }),
      { ip: '1.1.1.1', body: good },
    );
    expect(r.status).toBe(403);
  });
  it('fails closed on captcha and does not create', async () => {
    const d = deps({ captcha: async () => ({ ok: false, reason: 'missing_token' }) });
    expect((await submitPublic(d, { ip: '1.1.1.1', body: good })).status).toBe(400);
    expect(d.create).not.toHaveBeenCalled();
  });
  it('rate limits', async () => {
    const d = deps({ rateLimit: async () => false });
    expect((await submitPublic(d, { ip: '1.1.1.1', body: good })).status).toBe(429);
  });
  it('creates, and answers the same whatever the email is', async () => {
    const a = await submitPublic(deps(), { ip: '1.1.1.1', body: good });
    const b = await submitPublic(deps({ signals: async () => ({ ...calm, known_email: 0 }) }), {
      ip: '1.1.1.1',
      body: { ...good, email: 'new@example.com' },
    });
    expect(a.status).toBe(200);
    expect(Object.keys(a.body).sort()).toEqual(Object.keys(b.body).sort());
  });
  it('holds suspicious requests without sending email', async () => {
    const flush = vi.fn(async () => undefined);
    const r = await submitPublic(
      deps({ flushEmails: flush, signals: async () => ({ ...calm, known_email: 0 }) }),
      {
        ip: '1.1.1.1',
        body: { ...good, body: 'visit http://spam.test' },
      },
    );
    expect(r.body.held).toBe(true);
    expect(flush).not.toHaveBeenCalled();
  });
});

describe('finalizeAttachments', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);
  const rid = '11111111-1111-1111-1111-111111111111';
  const mk = (bytes: Uint8Array | null, allowed = true) => {
    const remove = vi.fn(async () => undefined);
    const record = vi.fn(async () => undefined);
    return {
      remove,
      record,
      d: {
        authorize: async () => allowed,
        settings: async () => settings,
        rateLimit: async () => true,
        download: async () => bytes,
        remove,
        record,
        log: () => undefined,
      },
    };
  };
  it('records a real image', async () => {
    const m = mk(png);
    const r = await finalizeAttachments(m.d, {
      ip: 'i',
      requestId: rid,
      token: null,
      files: [{ path: `${rid}/a/b.png`, name: 'b.png' }],
    });
    expect(r.body.results).toEqual([{ path: `${rid}/a/b.png`, ok: true }]);
    expect(m.record).toHaveBeenCalled();
  });
  it('deletes a file whose bytes are not an allowed type', async () => {
    const m = mk(new TextEncoder().encode('<html><script>alert(1)</script></html>'));
    const r = await finalizeAttachments(m.d, {
      ip: 'i',
      requestId: rid,
      token: null,
      files: [{ path: `${rid}/a/b.png`, name: 'b.png' }],
    });
    expect(r.body.results).toEqual([{ path: `${rid}/a/b.png`, ok: false, error: 'file_type' }]);
    expect(m.remove).toHaveBeenCalled();
  });
  it('refuses unauthorised callers and paths outside the request', async () => {
    expect(
      (
        await finalizeAttachments(mk(png, false).d, {
          ip: 'i',
          requestId: rid,
          token: null,
          files: [],
        })
      ).status,
    ).toBe(403);
    const r = await finalizeAttachments(mk(png).d, {
      ip: 'i',
      requestId: rid,
      token: null,
      files: [{ path: 'other/a/b.png', name: 'b.png' }],
    });
    expect(r.body.results).toEqual([{ path: 'other/a/b.png', ok: false, error: 'invalid_path' }]);
  });
});

describe('token view and reply', () => {
  const tok = 'a'.repeat(43);
  const base = { rateLimit: async () => true, sha256Hex: async (s: string) => `h:${s}` };
  it('returns 404 for a malformed or unknown token, identical either way', async () => {
    const d = { ...base, view: async () => null, reply: async () => null };
    expect((await viewByToken(d, { ip: 'i', token: 'short' })).status).toBe(404);
    expect((await viewByToken(d, { ip: 'i', token: tok })).status).toBe(404);
  });
  it('looks up by hash, never by the raw token', async () => {
    const view = vi.fn(async () => ({ ref: 'SUP-001001' }));
    await viewByToken({ ...base, view, reply: async () => null }, { ip: 'i', token: tok });
    expect(view).toHaveBeenCalledWith(`h:${tok}`);
  });
  it('maps a closed request and validates the body', async () => {
    const d = {
      ...base,
      view: async () => null,
      reply: async () => {
        throw new Error('request_closed');
      },
    };
    expect((await replyByToken(d, { ip: 'i', token: tok, body: 'hi' })).status).toBe(409);
    expect((await replyByToken(d, { ip: 'i', token: tok, body: '' })).status).toBe(422);
  });
});

describe('drainEmails', () => {
  it('sends a fresh link per email and records the outcome', async () => {
    const done = vi.fn(async () => undefined);
    const send = vi.fn(async (_m: { to: string; subject: string; text: string }) => ({
      ok: true,
      status: 200,
    }));
    const r = await drainEmails({
      claim: async () => [
        {
          id: 'q1',
          kind: 'reply',
          request_id: 'r1',
          ref: 'SUP-001001',
          email: 'a@example.com',
          body: 'Hello',
        },
        {
          id: 'q2',
          kind: 'received',
          request_id: 'r2',
          ref: 'SUP-001002',
          email: null,
          body: null,
        },
      ],
      mint: async () => 'rawtoken',
      send,
      done,
      appUrl: 'https://app.test',
      contactEmail: null,
      log: () => undefined,
    });
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(send.mock.calls[0]![0].text).toContain('https://app.test/help/r/rawtoken');
    expect(done).toHaveBeenCalledWith('q1', null);
    expect(done).toHaveBeenCalledWith('q2', 'no_email');
  });
});
