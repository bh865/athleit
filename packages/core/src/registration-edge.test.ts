/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles are deliberately loose */
import { inflateSync } from 'node:zlib';

import * as pdfLib from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { turnstileVerifier } from '../../../supabase/functions/_shared/registration/captcha';
import { registrationsToCsv } from '../../../supabase/functions/_shared/registration/export';
import {
  processRegistrationEmails,
  renderRegistrationEmail,
  resendMailer,
  verificationEmail,
} from '../../../supabase/functions/_shared/registration/mail';
import { claimRegistration } from '../../../supabase/functions/_shared/registration/claim';
import { getPublicRegistration } from '../../../supabase/functions/_shared/registration/public';
import { signWaiver } from '../../../supabase/functions/_shared/registration/sign';
import { submitRegistration } from '../../../supabase/functions/_shared/registration/submit';
import {
  clientIp,
  mapDbError,
  randomToken,
  readJsonBody,
  sha256Hex,
} from '../../../supabase/functions/_shared/registration/util';
import { verifyRegistration } from '../../../supabase/functions/_shared/registration/verify';
import {
  buildWaiverPdf,
  markdownToPlain,
  toWinAnsi,
} from '../../../supabase/functions/_shared/registration/waiver-pdf';

const FORM = {
  fields: [
    {
      id: 'shirt',
      type: 'dropdown',
      label: 'Shirt',
      required: true,
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
      ],
    },
    { id: 'has_allergy', type: 'checkbox', label: 'Any allergies?' },
    {
      id: 'allergy',
      type: 'long_text',
      label: 'Allergies',
      sensitive: true,
      show_if: { field: 'has_allergy', equals: true },
    },
  ],
};
const EVENT = {
  title: 'Fall Season',
  state: 'open',
  requires_account: false,
  price_cents: null,
  payment_timing: 'none',
  form: { version_id: '11111111-1111-4111-8111-111111111111', schema: FORM },
  waivers: [],
};
const body = (over: Record<string, unknown> = {}) => ({
  slug: 'fall-season-2026',
  formVersionId: EVENT.form.version_id,
  guardianName: 'Pat Parent',
  guardianEmail: ' PAT@Example.TEST ',
  guardianRelationship: 'Mother',
  playerFirstName: 'Ava',
  playerLastName: 'Adams',
  playerDateOfBirth: '2016-05-05',
  guardianAttestation: true,
  answers: { shirt: 's' },
  captchaToken: 'XXXX.DUMMY.TOKEN.XXXX',
  ...over,
});

function submitHarness(
  opts: {
    event?: any;
    captcha?: boolean;
    limits?: boolean;
    createError?: unknown;
    user?: boolean;
  } = {},
) {
  const logs: string[] = [];
  const sent: any[] = [];
  const store: any = {
    rateLimit: vi.fn(async () => opts.limits !== false),
    publicEvent: vi.fn(async () => (opts.event === undefined ? EVENT : opts.event)),
    user: vi.fn(async () => (opts.user ? { id: 'user-1' } : null)),
    eventId: vi.fn(async () => 'event-1'),
    create: vi.fn(async () => {
      if (opts.createError) throw opts.createError;
      return {
        id: 'reg-1',
        display_id: 'REG-1042',
        status: opts.user ? 'submitted' : 'pending_verification',
      };
    }),
    findPending: vi.fn(async () => 'reg-pending'),
    issueToken: vi.fn(async () => undefined),
  };
  const deps = {
    store,
    appUrl: 'https://app.example.test',
    captcha: async () => ({ ok: opts.captcha !== false }),
    mailer: {
      send: async (m: any) => {
        sent.push(m);
        return { ok: true, status: 200 };
      },
    },
    log: (l: string, e: string, f?: object) => logs.push(JSON.stringify({ l, e, ...f })),
    token: () => 'TESTTOKEN_abcdefghijklmnop',
  };
  const run = (b: unknown, auth: string | null = null) =>
    submitRegistration(deps as any, { ip: '203.0.113.5', authHeader: auth, body: b });
  return { store, sent, logs, run };
}

describe('submit-registration', () => {
  it('creates an anonymous registration as pending and emails a hashed single-use link (token in the fragment)', async () => {
    const h = submitHarness();
    const r = await h.run(body());
    // 202 and an identical body to a duplicate: a stranger cannot tell whether the child was already registered.
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ ok: true, status: 'pending_verification', next: ['verify_email'] });
    expect(h.store.create.mock.calls[0][0]).toMatchObject({
      guardianEmail: 'pat@example.test',
      submittedBy: null,
    });
    expect(h.store.issueToken).toHaveBeenCalledWith(
      'reg-1',
      await sha256Hex('TESTTOKEN_abcdefghijklmnop'),
      60,
      false,
    );
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe('pat@example.test');
    expect(h.sent[0].text).toContain('/register/verify#token=TESTTOKEN_abcdefghijklmnop');
  });
  it('never logs answers, emails, names or tokens', async () => {
    const h = submitHarness();
    await h.run(body({ answers: { shirt: 'm', has_allergy: true, allergy: 'peanuts' } }));
    const all = h.logs.join('\n');
    for (const secret of [
      'pat@example.test',
      'Pat Parent',
      'Ava',
      'peanuts',
      'TESTTOKEN',
      'XXXX.DUMMY',
    ])
      expect(all).not.toContain(secret);
  });
  it('splits sensitive answers from ordinary ones', async () => {
    const h = submitHarness();
    await h.run(body({ answers: { shirt: 'm', has_allergy: true, allergy: 'peanuts' } }));
    const a = h.store.create.mock.calls[0][0];
    expect(a.answers).toEqual({ shirt: 'm', has_allergy: true });
    expect(a.sensitive).toEqual({ allergy: 'peanuts' });
  });
  it('honeypot: pretends to succeed, creates and sends nothing', async () => {
    const h = submitHarness();
    const r = await h.run(body({ website: 'http://spam.example' }));
    expect(r.status).toBe(202);
    expect(h.store.create).not.toHaveBeenCalled();
    expect(h.sent).toHaveLength(0);
  });
  it.each([
    ['unknown top-level key', { admin: true }],
    ['missing guardian attestation', { guardianAttestation: false }],
    ['bad email', { guardianEmail: 'nope' }],
    ['bad dob', { playerDateOfBirth: '2016-13-45' }],
    ['child login style field', { playerEmail: 'kid@example.test' }],
  ])('400 for %s', async (_n, over) => {
    const h = submitHarness();
    const r = await h.run(body(over));
    expect(r.status).toBe(400);
    expect(h.store.create).not.toHaveBeenCalled();
  });
  it('captcha failure: 400 and nothing created', async () => {
    const h = submitHarness({ captcha: false });
    expect((await h.run(body())).body).toEqual({ error: 'captcha_failed' });
    expect(h.store.create).not.toHaveBeenCalled();
  });
  it('rate limited: 429', async () => {
    const h = submitHarness({ limits: false });
    expect((await h.run(body())).status).toBe(429);
    expect(h.store.create).not.toHaveBeenCalled();
  });
  it('limits per IP, per (hashed) email and per event', async () => {
    const h = submitHarness();
    await h.run(body());
    const buckets = h.store.rateLimit.mock.calls.map((c: any[]) => c[0]);
    expect(buckets).toEqual([
      `reg-submit:ip:203.0.113.5`,
      expect.stringMatching(/^reg-submit:email:[0-9a-f]{32}$/),
      'reg-submit:event:fall-season-2026',
    ]);
    expect(buckets.join()).not.toContain('pat@example.test');
  });
  describe('validation matrix against the published form', () => {
    it.each([
      ['missing required field', { answers: {} }, 'shirt'],
      ['unknown option', { answers: { shirt: 'xl' } }, 'shirt'],
      ['wrong type', { answers: { shirt: 5 } }, 'shirt'],
      ['unknown field', { answers: { shirt: 's', evil: 'x' } }, 'evil'],
      ['hidden-field smuggling', { answers: { shirt: 's', allergy: 'peanuts' } }, 'allergy'],
      ['oversized payload', { answers: { shirt: 's', junk: 'x'.repeat(60_000) } }, '_form'],
    ])('422 for %s', async (_n, over, field) => {
      const h = submitHarness();
      const r = await h.run(body(over));
      expect(r.status).toBe(422);
      expect(Object.keys((r.body as any).fields)).toContain(field);
      expect(h.store.create).not.toHaveBeenCalled();
    });
    it('409 when the form version changed', async () => {
      const h = submitHarness();
      expect(
        (await h.run(body({ formVersionId: '22222222-2222-4222-8222-222222222222' }))).body,
      ).toEqual({ error: 'form_changed' });
    });
  });
  describe('event rules', () => {
    it('404 for an unknown or invisible event', async () =>
      expect((await submitHarness({ event: null }).run(body())).status).toBe(404));
    it('409 when closed or not yet open', async () => {
      expect(
        (await submitHarness({ event: { ...EVENT, state: 'closed' } }).run(body())).body,
      ).toEqual({ error: 'registration_closed' });
      expect(
        (await submitHarness({ event: { ...EVENT, state: 'upcoming' } }).run(body())).body,
      ).toEqual({ error: 'not_open_yet' });
    });
    it('a paid at-submission event refuses anonymous submissions', async () => {
      const h = submitHarness({
        event: {
          ...EVENT,
          requires_account: true,
          price_cents: 5000,
          payment_timing: 'at_submission',
        },
      });
      expect((await h.run(body())).status).toBe(401);
      expect(h.store.create).not.toHaveBeenCalled();
    });
    it('a signed-in guardian skips verification and is told the next steps', async () => {
      const h = submitHarness({
        user: true,
        event: {
          ...EVENT,
          price_cents: 5000,
          payment_timing: 'at_submission',
          waivers: [{ version_id: 'w1', title: 'Liability' }],
        },
      });
      const r = await h.run(body(), 'Bearer user.jwt');
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        status: 'submitted',
        next: ['sign_waivers', 'pay'],
        waiverVersionIds: ['w1'],
      });
      expect(h.store.issueToken).not.toHaveBeenCalled();
      expect(h.sent).toHaveLength(0);
    });
    it('an invalid session is 401', async () =>
      expect((await submitHarness().run(body(), 'Bearer bad')).status).toBe(401));
  });
  describe('duplicates and database errors', () => {
    it('an anonymous duplicate looks like success (no enumeration) and re-sends the link', async () => {
      const h = submitHarness({ createError: { code: '23505', message: 'duplicate key value' } });
      const r = await h.run(body());
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ ok: true, status: 'pending_verification', next: ['verify_email'] });
      expect(h.store.issueToken).toHaveBeenCalledWith('reg-pending', expect.any(String), 60, true);
    });
    it('a signed-in duplicate is 409', async () => {
      const h = submitHarness({
        user: true,
        createError: { code: '23505', message: 'duplicate key' },
      });
      expect((await h.run(body(), 'Bearer user.jwt')).body).toEqual({
        error: 'already_registered',
      });
    });
    it.each([
      ['registration_full', 409],
      ['not_eligible', 422],
      ['account_required', 401],
      ['weird failure', 500],
    ])('maps %s to %i', async (msg, status) => {
      const r = await submitHarness({ createError: new Error(msg) }).run(body());
      expect(r.status).toBe(status);
      expect(JSON.stringify(r.body)).not.toContain('weird');
    });
  });
});

describe('captcha (Turnstile)', () => {
  const ok = (json: object, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(json), { status }));
  it('passes on success and posts the secret, token and ip', async () => {
    const f = ok({ success: true });
    expect(
      await turnstileVerifier({ secret: '1x0000000000000000000000000000000AA', fetch: f as any })(
        'XXXX.DUMMY.TOKEN.XXXX',
        '203.0.113.5',
      ),
    ).toEqual({ ok: true });
    const sent = (f.mock.calls[0] as any)[1].body as URLSearchParams;
    expect(sent.get('secret')).toBe('1x0000000000000000000000000000000AA');
    expect(sent.get('response')).toBe('XXXX.DUMMY.TOKEN.XXXX');
    expect(sent.get('remoteip')).toBe('203.0.113.5');
  });
  it('fails closed: refused token, missing token, no secret, http error, network error', async () => {
    expect(
      (
        await turnstileVerifier({
          secret: 's',
          fetch: ok({ success: false, 'error-codes': ['invalid-input-response'] }) as any,
        })('t', 'x')
      ).ok,
    ).toBe(false);
    expect(
      (
        await turnstileVerifier({ secret: 's', fetch: ok({ success: true }) as any })(
          undefined,
          'x',
        )
      ).reason,
    ).toBe('missing_token');
    expect(
      (
        await turnstileVerifier({ secret: undefined, fetch: ok({ success: true }) as any })(
          't',
          'x',
        )
      ).reason,
    ).toBe('not_configured');
    expect((await turnstileVerifier({ secret: 's', fetch: ok({}, 500) as any })('t', 'x')).ok).toBe(
      false,
    );
    expect(
      (
        await turnstileVerifier({
          secret: 's',
          fetch: (async () => {
            throw new Error('net');
          }) as any,
        })('t', 'x')
      ).ok,
    ).toBe(false);
  });
});

describe('verify-registration', () => {
  const mk = (consume: () => Promise<any>) => {
    const store: any = {
      rateLimit: vi.fn(async () => true),
      consume: vi.fn(consume),
      issueSignToken: vi.fn(async () => undefined),
      signingState: vi.fn(async () => ({
        waivers: [{ version_id: 'w1', title: 'Liability', signed: false }],
      })),
    };
    return {
      store,
      run: (b: unknown) =>
        verifyRegistration(
          { store, log: () => undefined, token: () => 'SIGNTOKEN_abcdefghijklmnop' },
          { ip: '1.1.1.1', body: b },
        ),
    };
  };
  const goodToken = 'A'.repeat(43);
  it('verifies, hashes the token, and hands out a signing token in the body', async () => {
    const h = mk(async () => ({
      registration_id: 'r1',
      display_id: 'REG-1042',
      status: 'submitted',
    }));
    const r = await h.run({ token: goodToken });
    expect(h.store.consume).toHaveBeenCalledWith(await sha256Hex(goodToken));
    expect(r.body).toMatchObject({
      ok: true,
      displayId: 'REG-1042',
      signToken: 'SIGNTOKEN_abcdefghijklmnop',
      next: ['sign_waivers'],
    });
  });
  it('replay, expiry and unknown tokens look identical', async () => {
    const h = mk(async () => {
      throw new Error('invalid_token');
    });
    expect(await h.run({ token: goodToken })).toEqual({
      status: 400,
      body: { error: 'invalid_token' },
    });
  });
  it.each([[undefined], [''], ['short'], ['has spaces and !! symbols 0123456789'], [{ a: 1 }]])(
    'refuses malformed token %j',
    async (t) => {
      const h = mk(async () => ({}));
      expect((await h.run({ token: t })).status).toBe(400);
      expect(h.store.consume).not.toHaveBeenCalled();
    },
  );
  it('a full or closed event does not burn into a generic error', async () => {
    expect(
      (
        await mk(async () => {
          throw new Error('registration_closed');
        }).run({ token: goodToken })
      ).body,
    ).toEqual({ error: 'registration_closed' });
  });
});

describe('waiver PDF', () => {
  const data = {
    waiver: {
      title: 'Liability Release',
      version: 3,
      body: '# Release\n\nI **agree** to the terms. – “quoted” – 日本',
      content_hash: 'ab'.repeat(32),
    },
    signer: { name: 'Pat Parent', relationship: 'Mother', email: 'pat@example.test' },
    acceptedAt: '2026-11-17T10:00:00.000Z',
    electronicConsent: true,
    registrationDisplayId: 'REG-1042',
    playerName: 'Ava Adams',
    subject: 'Fall Season',
  };
  const text = (bytes: Uint8Array) => {
    const raw = Buffer.from(bytes);
    const out: string[] = [];
    // Page content streams are Flate-compressed; standard-font text inside them is written as hex strings.
    for (const m of raw.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      try {
        const inflated = inflateSync(Buffer.from(m[1]!, 'latin1')).toString('latin1');
        for (const h of inflated.matchAll(/<([0-9A-Fa-f]{2,})>\s*Tj/g))
          out.push(Buffer.from(h[1]!, 'hex').toString('latin1'));
      } catch {
        /* not a compressed content stream */
      }
    }
    return out.join('\n');
  };
  it('contains the signed text, version, hash, signer, timestamp and consent', async () => {
    const t = text(await buildWaiverPdf(pdfLib as any, data));
    for (const s of [
      'Liability Release',
      'Version 3',
      'ab'.repeat(32).slice(0, 40),
      'Signed by: Pat Parent',
      'Mother',
      '2026-11-17T10:00:00.000Z',
      'REG-1042',
      'Ava Adams',
      'electronic records and signatures: Yes',
      'I agree to the terms',
    ])
      expect(t).toContain(s);
  });
  it('is a valid multi-page PDF for long text', async () => {
    const long = {
      ...data,
      waiver: { ...data.waiver, body: 'Paragraph of legal text. '.repeat(900) },
    };
    const bytes = await buildWaiverPdf(pdfLib as any, long);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    expect((await pdfLib.PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
  it('markdown becomes plain text, never markup', () => {
    expect(markdownToPlain('# T\n\n**b** and _i_ [x](https://e.test) `c`\n- a')).toBe(
      'T\n\nb and _i_ x (https://e.test) c\n• a',
    );
    expect(toWinAnsi('日本 “q”')).toBe('?? "q"');
  });
});

describe('sign-waiver', () => {
  const ctx = {
    waiver: { title: 'Liability', version: 1, body: 'text', content_hash: 'cd'.repeat(32) },
    signer_name: 'Pat',
    signer_relationship: 'Mother',
    signer_email: 'typed@example.test',
    guardian_email: 'guardian@example.test',
    accepted_at: '2026-11-17T10:00:00Z',
    electronic_consent: true,
    registration_display_id: 'REG-1',
    player_name: 'Ava',
    subject: 'Fall',
  };
  const mk = (over: Partial<any> = {}) => {
    const sent: any[] = [];
    const store: any = {
      rateLimit: vi.fn(async () => true),
      user: vi.fn(async () => ({ id: 'u1' })),
      resolveSignToken: vi.fn(async () => '66666666-6666-4666-8666-666666666666'),
      signingState: vi.fn(async () => ({
        display_id: 'REG-1',
        waivers: [{ version_id: 'w1', title: 'L', body: 'b', content_hash: 'h', signed: false }],
      })),
      recordAsUser: vi.fn(async () => 'acc-1'),
      recordAsService: vi.fn(async () => 'acc-1'),
      recordEvidence: vi.fn(async () => undefined),
      context: vi.fn(async () => ctx),
      storeCopy: vi.fn(async () => undefined),
      attachCopy: vi.fn(async () => undefined),
      ...over,
    };
    const deps: any = {
      store,
      mailer: {
        send: async (m: any) => {
          sent.push(m);
          return { ok: true, status: 200 };
        },
      },
      pdf: pdfLib,
      appUrl: 'https://app.example.test',
      recordEvidence: false,
      log: () => undefined,
    };
    return {
      store,
      sent,
      deps,
      run: (b: any, auth: string | null = null, d = deps) =>
        signWaiver(d, { ip: '203.0.113.9', userAgent: 'UA/1', authHeader: auth, body: b }),
    };
  };
  const sig = {
    waiverVersionId: '33333333-3333-4333-8333-333333333333',
    signerName: 'Pat Parent',
    signerRelationship: 'Mother',
    signerEmail: 'PAT@example.test',
    electronicConsent: true,
  };
  const tok = 'T'.repeat(43);
  it("token path: records under the token's registration, stores the PDF, attaches it once and emails it", async () => {
    const h = mk();
    const r = await h.run({ ...sig, signToken: tok });
    expect(r).toEqual({ status: 201, body: { ok: true, acceptanceId: 'acc-1', copy: 'emailed' } });
    expect(h.store.recordAsService).toHaveBeenCalledWith(
      '66666666-6666-4666-8666-666666666666',
      expect.objectContaining({ signerEmail: 'pat@example.test', consent: true }),
      null,
      null,
    );
    expect(h.store.storeCopy.mock.calls[0][0]).toBe('wc/acc-1.pdf');
    expect(h.store.attachCopy).toHaveBeenCalledWith('acc-1', 'wc/acc-1.pdf');
    expect(h.sent[0].to).toBe('guardian@example.test'); // the registration's verified address, never the typed signer email
    expect(h.sent[0].attachments[0].filename).toMatch(/\.pdf$/);
    expect(
      Buffer.from(h.sent[0].attachments[0].contentBase64, 'base64').subarray(0, 5).toString(),
    ).toBe('%PDF-');
  });
  it('signed-in path records AS the user (the database checks ownership)', async () => {
    const h = mk();
    const r = await h.run(
      { ...sig, registrationId: '44444444-4444-4444-8444-444444444444' },
      'Bearer user.jwt',
    );
    expect(r.status).toBe(201);
    expect(h.store.recordAsUser).toHaveBeenCalledWith(
      'Bearer user.jwt',
      expect.objectContaining({ registrationId: '44444444-4444-4444-8444-444444444444' }),
    );
    expect(h.store.recordAsService).not.toHaveBeenCalled();
  });
  it('401 without a session or a valid token; unknown token is refused', async () => {
    const h = mk({ resolveSignToken: vi.fn(async () => null) });
    expect((await h.run({ ...sig })).status).toBe(401);
    expect((await h.run({ ...sig, signToken: tok })).status).toBe(401);
    expect((await h.run({ ...sig, signToken: 'bad token!' })).status).toBe(401);
  });
  it('a signing token cannot sign for another registration or a player', async () => {
    const h = mk();
    expect(
      (
        await h.run({
          ...sig,
          signToken: tok,
          registrationId: '55555555-5555-4555-8555-555555555555',
        })
      ).status,
    ).toBe(400);
    expect(
      (await h.run({ ...sig, signToken: tok, playerId: '55555555-5555-4555-8555-555555555555' }))
        .status,
    ).toBe(400);
    expect(h.store.recordAsService).not.toHaveBeenCalled();
  });
  it('requires consent to electronic records and a typed name', async () => {
    const h = mk();
    expect((await h.run({ ...sig, signToken: tok, electronicConsent: false })).status).toBe(400);
    expect((await h.run({ ...sig, signToken: tok, signerName: '  ' })).status).toBe(400);
  });
  it('signing twice is 409; the signature is not lost when the PDF fails', async () => {
    expect(
      (
        await mk({
          recordAsService: vi.fn(async () => {
            throw new Error('duplicate key value');
          }),
        }).run({ ...sig, signToken: tok })
      ).body,
    ).toEqual({ error: 'already_signed' });
    const h = mk({
      storeCopy: vi.fn(async () => {
        throw new Error('storage down');
      }),
    });
    expect((await h.run({ ...sig, signToken: tok })).body).toEqual({
      ok: true,
      acceptanceId: 'acc-1',
      copy: 'pending',
    });
  });
  it('records IP and user agent only when the product decision enables it', async () => {
    const off = mk();
    await off.run({ ...sig, signToken: tok });
    expect(off.store.recordAsService.mock.calls[0].slice(2)).toEqual([null, null]);
    const on = mk();
    await on.run({ ...sig, signToken: tok }, null, { ...on.deps, recordEvidence: true });
    expect(on.store.recordAsService.mock.calls[0].slice(2)).toEqual(['203.0.113.9', 'UA/1']);
  });
  it('state action returns the remaining waivers for the signing screen (token only)', async () => {
    const h = mk();
    expect((await h.run({ action: 'state', signToken: tok })).body).toMatchObject({
      displayId: 'REG-1',
      waivers: [{ versionId: 'w1', signed: false }],
    });
    expect((await h.run({ action: 'state' }, 'Bearer user.jwt')).status).toBe(400);
  });
});

describe('get-public-registration', () => {
  const ev = {
    slug: 'fall',
    title: 'Fall',
    spots: 'few',
    noindex: false,
    cover_image_path: 'team/cover.png',
  };
  const mk = (e: any = ev, limit = true) => ({
    rateLimit: async () => limit,
    event: vi.fn(async () => e),
    coverUrl: vi.fn(async () => 'https://signed.example/c.png'),
  });
  it('anonymous: cacheable, cover path replaced by a short-lived signed url', async () => {
    const r = await getPublicRegistration(
      { store: mk() as any },
      { ip: '1.1.1.1', slug: 'fall-season', authHeader: null },
    );
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toContain('public');
    expect((r.body as any).cover_url).toBe('https://signed.example/c.png');
    expect(JSON.stringify(r.body)).not.toContain('team/cover.png');
  });
  it('signed in: never cached; noindex events send X-Robots-Tag', async () => {
    const r = await getPublicRegistration(
      { store: mk({ ...ev, noindex: true }) as any },
      { ip: '1.1.1.1', slug: 'fall-season', authHeader: 'Bearer x' },
    );
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
  it('hidden, malformed and rate-limited lookups all look alike and are not cached', async () => {
    for (const [slug, store] of [
      ['x', mk()],
      ['../etc', mk()],
      ['a'.repeat(200), mk()],
      ['nope-nope', mk(null)],
    ] as const) {
      const r = await getPublicRegistration(
        { store: store as any },
        { ip: '1.1.1.1', slug, authHeader: null },
      );
      expect(r).toMatchObject({
        status: 404,
        body: { error: 'not_found' },
        headers: { 'cache-control': 'no-store' },
      });
    }
    expect(
      (
        await getPublicRegistration(
          { store: mk(ev, false) as any },
          { ip: '1.1.1.1', slug: 'fall-season', authHeader: null },
        )
      ).status,
    ).toBe(429);
  });
});

describe('CSV export', () => {
  const payload = {
    fields: [
      { id: 'shirt', label: 'Shirt', type: 'dropdown' },
      { id: 'note', label: 'Note', type: 'short_text' },
    ],
    rows: [
      {
        display_id: 'REG-1',
        status: 'accepted',
        submitted_at: '2026-01-01',
        guardian_name: '=HYPERLINK("http://evil","x")',
        guardian_email: 'a@b.co',
        guardian_phone: '+15550100',
        guardian_relationship: '-1+1',
        player_first_name: '@SUM(1)',
        player_last_name: 'O"Neil, Jr',
        player_date_of_birth: '2016-01-01',
        answers: { shirt: 's', note: '\tcmd' },
      },
    ],
    include_sensitive: false,
  };
  it('neutralizes formula injection in every cell and quotes commas and quotes', () => {
    const csv = registrationsToCsv(payload as any);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain("'+15550100");
    expect(csv).toContain("'-1+1");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).toContain('"O""Neil, Jr"');
    expect(csv).toContain("'\tcmd");
  });
  it('only includes the columns the database returned (no sensitive column without the capability)', () => {
    const csv = registrationsToCsv({
      ...payload,
      rows: [{ ...payload.rows[0], sensitive_answers: { allergy: 'peanuts' } }],
    } as any);
    expect(csv).not.toContain('peanuts');
    expect(csv.split('\r\n')[0]).not.toContain('Allergies');
  });
  it('includes sensitive columns when the database returned them', () => {
    const csv = registrationsToCsv({
      fields: [
        ...payload.fields,
        { id: 'allergy', label: 'Allergies', type: 'long_text', sensitive: true },
      ],
      rows: [{ ...payload.rows[0], sensitive_answers: { allergy: 'peanuts' } }],
      include_sensitive: true,
    } as any);
    expect(csv).toContain('peanuts');
  });
});

describe('registration email', () => {
  it('renders plain text templates with the message and no markup', () => {
    const m = renderRegistrationEmail(
      'decision',
      {
        display_id: 'REG-1042',
        event_title: 'Fall',
        issuer_name: 'Hawks',
        player_first_name: 'Ava',
        status: 'accepted',
        note: 'Welcome <b>aboard</b>',
        price_cents: 2500,
        payment_timing: 'after_acceptance',
        needs_account: true,
      },
      'https://app.example.test',
    )!;
    expect(m.subject).toBe('Registration REG-1042: accepted');
    expect(m.text).toContain('$25.00');
    expect(m.text).toContain('sign in or create an Athleit account');
    expect(m.text).toContain('Welcome <b>aboard</b>'); // plain text: shown literally, never interpreted
  });
  it('keeps control characters out of subjects and returns null for unknown templates', () => {
    expect(
      renderRegistrationEmail(
        'decision',
        { display_id: 'REG-1\r\nBcc: x@evil.test', status: 'declined' },
        'https://a',
      )!.subject,
    ).not.toMatch(/[\r\n]/);
    expect(renderRegistrationEmail('mystery', {}, 'https://a')).toBeNull();
  });
  it('the verification link carries the token in the fragment', () => {
    expect(
      verificationEmail({
        appUrl: 'https://app.example.test/',
        token: 'tok',
        eventTitle: 'E',
        minutes: 60,
      }).text,
    ).toContain('https://app.example.test/register/verify#token=tok');
  });
  it('outbox processing: sent, skipped when unconfigured, failed with capped backoff', async () => {
    const rows = [
      {
        id: '1',
        recipient_email: 'a@b.co',
        payload: { template: 'received', display_id: 'REG-1' },
        attempts: 0,
      },
      { id: '2', recipient_email: 'a@b.co', payload: { template: 'nope' }, attempts: 0 },
      {
        id: '3',
        recipient_email: 'a@b.co',
        payload: { template: 'received', display_id: 'REG-3' },
        attempts: 4,
      },
    ];
    const finished: any[] = [];
    const store = {
      claim: async () => rows as any,
      issueClaimToken: async () => undefined,
      finish: async (id: string, attempts: number, r: any) => {
        finished.push([id, attempts, r]);
      },
    };
    const mailer = {
      send: async (m: any) => ({
        ok: m.subject.includes('REG-1 '),
        status: m.subject.includes('REG-1 ') ? 200 : 500,
      }),
    };
    const now = () => new Date('2026-01-01T00:00:00Z');
    expect(await processRegistrationEmails(store, mailer, 'https://a', now)).toEqual({
      sent: 1,
      skipped: 1,
      failed: 1,
    });
    expect(finished[0][2]).toEqual({ status: 'sent' });
    expect(finished[1][2]).toEqual({ status: 'skipped', reason: 'unknown_template' });
    expect(finished[2][2]).toMatchObject({ status: 'failed', retryAt: null }); // 5th attempt: parked
    const none: any[] = [];
    expect(
      await processRegistrationEmails(
        {
          claim: async () => rows.slice(0, 1) as any,
          issueClaimToken: async () => undefined,
          finish: async (...a: any[]) => {
            none.push(a);
          },
        },
        null,
        'https://a',
        now,
      ),
    ).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(none[0][2]).toEqual({ status: 'skipped', reason: 'channel_not_configured' });
  });
  it('resend transport sends attachments as base64', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await resendMailer({ apiKey: 'k', from: 'a@b.co', fetch: f as any }).send({
      to: 'x@y.co',
      subject: 's',
      text: 't',
      attachments: [{ filename: 'a.pdf', contentBase64: 'QUJD' }],
    });
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).attachments).toEqual([
      { filename: 'a.pdf', content: 'QUJD' },
    ]);
  });
});

describe('util', () => {
  it('clientIp prefers cf-connecting-ip, takes the last forwarded entry and rejects junk', () => {
    expect(
      clientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })),
    ).toBe('1.2.3.4');
    expect(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(new Headers({ 'x-forwarded-for': '<script>' }))).toBe('unknown');
  });
  it('tokens are long, url-safe and unique; hashes are sha256 hex', async () => {
    const a = randomToken(),
      b = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('readJsonBody enforces the size cap on declared and actual length and rejects bad JSON', async () => {
    const mk = (text: string, len?: string) =>
      new Request('https://x.test', {
        method: 'POST',
        body: text,
        headers: len ? { 'content-length': len } : {},
      });
    expect((await readJsonBody(mk('{"a":1}'), 100)).ok).toBe(true);
    expect(await readJsonBody(mk('{"a":"' + 'x'.repeat(200) + '"}'), 100)).toMatchObject({
      ok: false,
      status: 413,
    });
    expect(await readJsonBody(mk('{}', '99999'), 100)).toMatchObject({ ok: false, status: 413 });
    expect(await readJsonBody(mk('{nope'), 100)).toMatchObject({ ok: false, status: 400 });
  });
  it('mapDbError passes codes, never messages', () => {
    expect(mapDbError(new Error('ERROR: capacity detail 42 registration_full'))).toEqual({
      status: 409,
      code: 'registration_full',
    });
    expect(mapDbError(new Error('relation "x" does not exist'))).toEqual({
      status: 500,
      code: 'internal_error',
    });
  });
});

describe('hardening', () => {
  it('the anonymous new-registration and duplicate answers are byte-identical', async () => {
    const fresh = await submitHarness().run(body());
    const dup = await submitHarness({
      createError: { code: '23505', message: 'duplicate key' },
    }).run(body());
    expect(JSON.stringify(dup)).toBe(JSON.stringify(fresh));
  });
  it('clientIp trusts the LAST forwarded entry (the one the platform appended)', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }))).toBe('1.2.3.4');
  });
  it('sign-waiver (signed in) emails the copy to the account address, never the typed one, and limits per account', async () => {
    const sent: any[] = [];
    const ctx = {
      waiver: { title: 'L', version: 1, body: 'b', content_hash: 'cd'.repeat(32) },
      signer_name: 'Pat',
      signer_relationship: 'Mother',
      signer_email: 'victim@example.test',
      accepted_at: '2026-11-17T10:00:00Z',
      electronic_consent: true,
      registration_display_id: 'REG-1',
      player_name: 'Ava',
      subject: 'Fall',
    };
    const store: any = {
      rateLimit: vi.fn(async () => true),
      user: vi.fn(async () => ({ id: 'u1', email: 'me@example.test' })),
      recordAsUser: vi.fn(async () => 'acc'),
      recordEvidence: vi.fn(),
      context: vi.fn(async () => ctx),
      storeCopy: vi.fn(),
      attachCopy: vi.fn(),
    };
    const deps: any = {
      store,
      mailer: {
        send: async (m: any) => {
          sent.push(m);
          return { ok: true, status: 200 };
        },
      },
      pdf: pdfLib,
      appUrl: 'https://a',
      recordEvidence: false,
      log: () => undefined,
    };
    const sig = {
      waiverVersionId: '33333333-3333-4333-8333-333333333333',
      registrationId: '44444444-4444-4444-8444-444444444444',
      signerName: 'Pat',
      signerRelationship: 'Mother',
      signerEmail: 'victim@example.test',
      electronicConsent: true,
    };
    expect(
      (
        await signWaiver(deps, {
          ip: '1.1.1.1',
          userAgent: 'ua',
          authHeader: 'Bearer u',
          body: sig,
        })
      ).body,
    ).toMatchObject({ copy: 'emailed' });
    expect(sent[0].to).toBe('me@example.test');
    expect(store.rateLimit.mock.calls.map((c: any[]) => c[0])).toContain('reg-sign:user:u1');
  });
  it('the PDF says so when characters could not be drawn', async () => {
    const data = {
      waiver: { title: 'T', version: 1, body: '日本語 text', content_hash: 'ab'.repeat(32) },
      signer: { name: 'P', relationship: 'M', email: 'a@b.co' },
      acceptedAt: '2026-01-01T00:00:00Z',
      electronicConsent: true,
      registrationDisplayId: null,
      playerName: null,
      subject: null,
    };
    const bytes = await buildWaiverPdf(pdfLib as any, data);
    const t = [
      ...Buffer.from(bytes)
        .toString('latin1')
        .matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
    ]
      .map((m) => {
        try {
          return inflateSync(Buffer.from(m[1]!, 'latin1')).toString('latin1');
        } catch {
          return '';
        }
      })
      .join('');
    expect(
      [...t.matchAll(/<([0-9A-Fa-f]{2,})>\s*Tj/g)]
        .map((h) => Buffer.from(h[1]!, 'hex').toString('latin1'))
        .join('\n'),
    ).toContain('could not be drawn');
  });
  it('markdown conversion is linear on adversarial input', () => {
    const t0 = Date.now();
    markdownToPlain('*a '.repeat(20000) + '_b '.repeat(20000));
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('queued emails for anonymous registrants carry a freshly minted claim link (token only in the email)', async () => {
    const issued: any[] = [];
    const sent: any[] = [];
    const row = {
      id: '1',
      recipient_email: 'a@b.co',
      attempts: 0,
      payload: {
        template: 'decision',
        display_id: 'REG-1',
        status: 'accepted',
        needs_account: true,
        registration_id: 'reg-uuid',
        price_cents: 2500,
        payment_timing: 'after_acceptance',
      },
    };
    const store = {
      claim: async () => [row] as any,
      finish: async () => undefined,
      issueClaimToken: async (...a: any[]) => {
        issued.push(a);
      },
    };
    await processRegistrationEmails(
      store as any,
      {
        send: async (m: any) => {
          sent.push(m);
          return { ok: true, status: 200 };
        },
      },
      'https://app.example.test',
    );
    expect(issued).toHaveLength(1);
    const token = /#token=([A-Za-z0-9_-]+)/.exec(sent[0].text)![1]!;
    expect(issued[0][1]).toBe(await sha256Hex(token));
    expect(sent[0].text).toContain('https://app.example.test/register/claim#token=');
    expect(issued[0][0]).toBe('reg-uuid');
  });
  describe('claim-registration', () => {
    const tok = 'C'.repeat(43);
    const mk = (claim: () => Promise<string>) => {
      const store: any = {
        rateLimit: vi.fn(async () => true),
        user: vi.fn(async () => ({ id: 'u1' })),
        claim: vi.fn(claim),
      };
      return {
        store,
        run: (b: unknown, auth: string | null = 'Bearer u') =>
          claimRegistration(
            { store, log: () => undefined },
            { ip: '1.1.1.1', authHeader: auth, body: b },
          ),
      };
    };
    it('needs a session and a well-formed token; hashes the token', async () => {
      const h = mk(async () => 'reg-1');
      expect((await h.run({ token: tok }, null)).status).toBe(401);
      expect((await h.run({ token: 'nope' })).status).toBe(400);
      expect((await h.run({ token: tok })).body).toEqual({ ok: true, registrationId: 'reg-1' });
      expect(h.store.claim).toHaveBeenCalledWith(await sha256Hex(tok), 'u1');
    });
    it('a used, expired or unknown token is a plain invalid_token', async () => {
      expect(
        (
          await mk(async () => {
            throw new Error('invalid_token');
          }).run({ token: tok })
        ).body,
      ).toEqual({ error: 'invalid_token' });
    });
  });
});
