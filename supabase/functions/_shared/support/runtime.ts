// Deno wiring for the support Edge Functions (kept out of the testable cores).
import {
  allowedOrigins,
  appUrl,
  asCaller,
  captcha,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  mailer,
  makeLogger,
  service,
} from '../registration/runtime.ts';
import { randomToken, sha256Hex } from '../registration/util.ts';
import {
  drainEmails,
  type EmailDeps,
  type FinalizeDeps,
  type SubmitDeps,
  type SupportSettings,
  type TokenDeps,
} from './core.ts';
import { ALLOWED_MIME, safeFileName } from './rules.ts';

export {
  allowedOrigins,
  appUrl,
  asCaller,
  corsHeaders,
  effectiveAuth,
  env,
  json,
  makeLogger,
  service,
  sha256Hex,
};

const rateLimit =
  (db: ReturnType<typeof service>) =>
  async (bucket: string, limit: number, windowSeconds: number) => {
    const { data, error } = await db.rpc('svc_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true; // fail closed
  };
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};
const hashBytes = async (token: string) => '\\x' + (await sha256Hex(token));

export function settings(db = service()) {
  return async (): Promise<SupportSettings> => {
    const v = must(await db.rpc('get_public_help_values')) as Record<string, unknown>;
    return {
      public_tickets_enabled: v.public_tickets_enabled === true,
      max_attachments: Number(v.max_attachments ?? 3),
      max_attachment_mb: Number(v.max_attachment_mb ?? 10),
      contact_email: (v.contact_email as string | null) ?? null,
    };
  };
}

export function submitDeps(log: SubmitDeps['log']): SubmitDeps {
  const db = service();
  return {
    captcha: captcha(),
    rateLimit: rateLimit(db),
    settings: settings(db),
    signals: async (email, body) =>
      must(await db.rpc('svc_support_signals', { p_email: email, p_body: body })) as never,
    create: async (s, held) => {
      const r = must(
        await db.rpc('svc_create_public_support_request', {
          p_type: s.type,
          p_subject: s.subject,
          p_body: s.body,
          p_email: s.email,
          p_name: s.name,
          p_source_article: s.sourceArticle,
          p_source_route: s.sourceRoute,
          p_diagnostics: s.diagnostics,
          p_held: held !== null,
          p_held_reason: held,
        }),
      ) as { id: string; ref: string };
      return r;
    },
    uploadToken: async (requestId) => {
      const t = randomToken(32);
      must(
        await db.rpc('svc_support_mint_token', {
          p_request: requestId,
          p_hash: await hashBytes(t),
        }),
      );
      return t;
    },
    signUploads: async (requestId, files) => {
      const out: { path: string; token: string }[] = [];
      for (const f of files) {
        const path = `${requestId}/${crypto.randomUUID()}/${safeFileName(f.name)}`;
        const { data, error } = await db.storage
          .from('support-attachments')
          .createSignedUploadUrl(path);
        if (error || !data) throw error ?? new Error('sign_failed');
        out.push({ path, token: data.token });
      }
      return out;
    },
    flushEmails: async () => {
      await drainEmails(emailDeps(log), 5);
    },
    log,
  };
}

export function finalizeDeps(log: FinalizeDeps['log'], authHeader: string | null): FinalizeDeps {
  const db = service();
  return {
    authorize: async (requestId, token) => {
      if (token) {
        const { data } = await db
          .from('support_access_tokens')
          .select('id')
          .eq('request_id', requestId)
          .eq('token_hash', await hashBytes(token))
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        return !!data;
      }
      if (!authHeader) return false;
      // RLS: a signed-in requester can only see their own request.
      const { data } = await asCaller(authHeader)
        .from('support_requests')
        .select('id')
        .eq('id', requestId)
        .maybeSingle();
      return !!data;
    },
    settings: settings(db),
    rateLimit: rateLimit(db),
    download: async (path) => {
      const { data, error } = await db.storage.from('support-attachments').download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    remove: async (path) => {
      await db.storage.from('support-attachments').remove([path]);
    },
    record: async (a) => {
      must(
        await db.rpc('svc_support_record_attachment', {
          p_request: a.requestId,
          p_path: a.path,
          p_name: a.name,
          p_mime: a.mime,
          p_size: a.size,
          p_max: a.max,
        }),
      );
    },
    log,
  };
}

export function tokenDeps(): TokenDeps {
  const db = service();
  return {
    rateLimit: rateLimit(db),
    sha256Hex,
    view: async (h) => must(await db.rpc('svc_support_view_by_token', { p_hash: '\\x' + h })),
    reply: async (h, body) =>
      must(await db.rpc('svc_support_reply_by_token', { p_hash: '\\x' + h, p_body: body })),
  };
}

export function emailDeps(log: EmailDeps['log']): EmailDeps {
  const db = service();
  const m = mailer();
  return {
    claim: async (limit) =>
      must(await db.rpc('svc_support_claim_emails', { p_limit: limit })) as never,
    mint: async (requestId) => {
      const t = randomToken(32);
      must(
        await db.rpc('svc_support_mint_token', {
          p_request: requestId,
          p_hash: await hashBytes(t),
        }),
      );
      return t;
    },
    send: async (msg) => (m ? m.send(msg) : { ok: false, status: 0 }),
    done: async (id, error) => {
      must(await db.rpc('svc_support_email_done', { p_id: id, p_error: error }));
    },
    appUrl: appUrl(),
    contactEmail: null,
    log,
  };
}

export const mimeAllowList = ALLOWED_MIME;
