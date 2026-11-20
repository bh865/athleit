// Support Edge Function cores. Dependencies are injected so they run in unit tests without Deno or Supabase.
// Public rules: the response never reveals whether an email has an account; captcha fails closed; every path is rate limited.
import type { CaptchaVerifier } from '../registration/captcha.ts';
import { receivedEmail, replyEmail } from './mail.ts';
import {
  holdReason,
  LIMITS,
  sniffMime,
  validateSubmission,
  type Signals,
  type Submission,
} from './rules.ts';

export type Reply = { status: number; body: Record<string, unknown> };
export type Log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  extra?: Record<string, unknown>,
) => void;

export interface SupportSettings {
  public_tickets_enabled: boolean;
  max_attachments: number;
  max_attachment_mb: number;
  contact_email: string | null;
}

// Signed-out submission -------------------------------------------------------------------------------------------
export interface SubmitDeps {
  captcha: CaptchaVerifier;
  rateLimit: (bucket: string, limit: number, windowSeconds: number) => Promise<boolean>;
  settings: () => Promise<SupportSettings>;
  signals: (email: string, body: string) => Promise<Signals>;
  create: (s: Submission, held: string | null) => Promise<{ id: string; ref: string }>;
  /** Mints a token row and returns the raw token (used only to authorise the attachment upload that follows). */
  uploadToken: (requestId: string) => Promise<string>;
  /** Signed upload URLs for each declared file, under <request_id>/<uuid>/<name>. */
  signUploads: (
    requestId: string,
    files: Submission['files'],
  ) => Promise<{ path: string; token: string }[]>;
  /** Sends queued emails now (best effort); the cron job is the safety net. */
  flushEmails: () => Promise<void>;
  log: Log;
}

export async function submitPublic(
  deps: SubmitDeps,
  input: { ip: string; body: unknown },
): Promise<Reply> {
  const st = await deps.settings();
  if (!st.public_tickets_enabled)
    return { status: 403, body: { error: 'public_tickets_disabled' } };
  const v = validateSubmission(
    input.body,
    st.max_attachments,
    Math.min(st.max_attachment_mb * 1024 * 1024, LIMITS.maxBytesCeiling),
  );
  if (!v.ok) return { status: 422, body: { error: v.error, field: v.field } };
  const s = v.value;
  if (
    !(await deps.rateLimit(`support:ip:${input.ip}`, 10, 3600)) ||
    !(await deps.rateLimit(`support:email:${s.email}`, 5, 3600))
  )
    return { status: 429, body: { error: 'rate_limited' } };
  const cap = await deps.captcha(s.captchaToken, input.ip);
  if (!cap.ok) {
    deps.log('warn', 'captcha_refused', { reason: cap.reason });
    return { status: 400, body: { error: 'captcha_failed' } };
  }
  const reason = holdReason(await deps.signals(s.email, s.body), s);
  const made = await deps.create(s, reason);
  const uploads = s.files.length ? await deps.signUploads(made.id, s.files) : [];
  const finalizeToken = s.files.length ? await deps.uploadToken(made.id) : null;
  if (!reason) await deps.flushEmails().catch(() => undefined);
  deps.log('info', 'submitted', { held: reason !== null });
  // Identical shape whether or not the address belongs to an account.
  return {
    status: 200,
    body: {
      ok: true,
      ref: made.ref,
      held: reason !== null,
      uploads,
      finalize_token: finalizeToken,
      request_id: made.id,
    },
  };
}

// Finalize uploads -----------------------------------------------------------------------------------------------------
export interface FinalizeDeps {
  /** Resolves the request the caller may attach to: by signed-in ownership or by access token. Null when not allowed. */
  authorize: (requestId: string, token: string | null) => Promise<boolean>;
  settings: () => Promise<SupportSettings>;
  rateLimit: (bucket: string, limit: number, windowSeconds: number) => Promise<boolean>;
  download: (path: string) => Promise<Uint8Array | null>;
  remove: (path: string) => Promise<void>;
  record: (a: {
    requestId: string;
    path: string;
    name: string;
    mime: string;
    size: number;
    max: number;
  }) => Promise<void>;
  log: Log;
}

export async function finalizeAttachments(
  deps: FinalizeDeps,
  input: {
    ip: string;
    requestId: string;
    token: string | null;
    files: { path: string; name: string }[];
  },
): Promise<Reply> {
  const st = await deps.settings();
  if (!(await deps.rateLimit(`support:finalize:${input.ip}`, 30, 3600)))
    return { status: 429, body: { error: 'rate_limited' } };
  if (
    !/^[0-9a-f-]{36}$/i.test(input.requestId) ||
    !(await deps.authorize(input.requestId, input.token))
  )
    return { status: 403, body: { error: 'forbidden' } };
  const maxBytes = Math.min(st.max_attachment_mb * 1024 * 1024, LIMITS.maxBytesCeiling);
  const results: { path: string; ok: boolean; error?: string }[] = [];
  for (const f of input.files.slice(0, st.max_attachments)) {
    if (!f.path.startsWith(`${input.requestId}/`) || f.path.includes('..')) {
      results.push({ path: f.path, ok: false, error: 'invalid_path' });
      continue;
    }
    const bytes = await deps.download(f.path);
    const fail = async (error: string) => {
      await deps.remove(f.path);
      results.push({ path: f.path, ok: false, error });
    };
    if (!bytes) {
      results.push({ path: f.path, ok: false, error: 'missing' });
      continue;
    }
    if (bytes.length > maxBytes) {
      await fail('file_too_large');
      continue;
    }
    const mime = sniffMime(bytes);
    if (!mime) {
      await fail('file_type');
      continue;
    }
    try {
      await deps.record({
        requestId: input.requestId,
        path: f.path,
        name: f.name,
        mime,
        size: bytes.length,
        max: st.max_attachments,
      });
      results.push({ path: f.path, ok: true });
    } catch {
      await fail('rejected');
    }
  }
  return { status: 200, body: { results } };
}

// Token view and reply ----------------------------------------------------------------------------------------------------
export interface TokenDeps {
  rateLimit: (bucket: string, limit: number, windowSeconds: number) => Promise<boolean>;
  view: (hash: string) => Promise<unknown | null>;
  reply: (hash: string, body: string) => Promise<unknown | null>;
  sha256Hex: (s: string) => Promise<string>;
}
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export async function viewByToken(
  deps: TokenDeps,
  input: { ip: string; token: string },
): Promise<Reply> {
  if (!(await deps.rateLimit(`support:token:${input.ip}`, 60, 600)))
    return { status: 429, body: { error: 'rate_limited' } };
  if (!TOKEN_RE.test(input.token)) return { status: 404, body: { error: 'not_found' } };
  const r = await deps.view(await deps.sha256Hex(input.token));
  return r ? { status: 200, body: { request: r } } : { status: 404, body: { error: 'not_found' } };
}

export async function replyByToken(
  deps: TokenDeps,
  input: { ip: string; token: string; body: unknown },
): Promise<Reply> {
  if (!(await deps.rateLimit(`support:tokenreply:${input.ip}`, 20, 3600)))
    return { status: 429, body: { error: 'rate_limited' } };
  if (!TOKEN_RE.test(input.token)) return { status: 404, body: { error: 'not_found' } };
  const text = typeof input.body === 'string' ? input.body.trim() : '';
  if (!text || text.length > LIMITS.body) return { status: 422, body: { error: 'invalid_body' } };
  try {
    const r = await deps.reply(await deps.sha256Hex(input.token), text);
    return r ? { status: 200, body: { ok: true } } : { status: 404, body: { error: 'not_found' } };
  } catch (e) {
    return String((e as { message?: string })?.message).includes('request_closed')
      ? { status: 409, body: { error: 'request_closed' } }
      : { status: 500, body: { error: 'internal_error' } };
  }
}

// Email queue ---------------------------------------------------------------------------------------------------------------
export interface QueuedEmail {
  id: string;
  kind: 'received' | 'reply';
  request_id: string;
  ref: string;
  email: string | null;
  body: string | null;
}
export interface EmailDeps {
  claim: (limit: number) => Promise<QueuedEmail[]>;
  /** Mints a fresh access token for the request and returns the raw token. */
  mint: (requestId: string) => Promise<string>;
  send: (m: {
    to: string;
    subject: string;
    text: string;
  }) => Promise<{ ok: boolean; status: number }>;
  done: (id: string, error: string | null) => Promise<void>;
  appUrl: string;
  contactEmail: string | null;
  log: Log;
}

export async function drainEmails(
  deps: EmailDeps,
  limit = 25,
): Promise<{ sent: number; failed: number }> {
  let sent = 0,
    failed = 0;
  for (const q of await deps.claim(limit)) {
    if (!q.email) {
      await deps.done(q.id, 'no_email');
      failed++;
      continue;
    }
    try {
      const url = `${deps.appUrl}/help/r/${await deps.mint(q.request_id)}`;
      const msg =
        q.kind === 'received'
          ? receivedEmail({ ref: q.ref, url, contactEmail: deps.contactEmail })
          : replyEmail({ ref: q.ref, body: q.body ?? '', url });
      const r = await deps.send({ to: q.email, ...msg });
      await deps.done(q.id, r.ok ? null : `email_http_${r.status}`);
      r.ok ? sent++ : failed++;
    } catch (e) {
      await deps.done(q.id, e instanceof Error ? e.name : 'error');
      failed++;
    }
  }
  deps.log('info', 'emails', { sent, failed });
  return { sent, failed };
}
