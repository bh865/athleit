// Deno wiring for the registration Edge Functions (kept out of the testable cores).
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { corsHeaders, json } from '../payments/http.ts';
import { makeLogger, type Logger } from '../payments/log.ts';
import { turnstileVerifier } from './captcha.ts';
import { resendMailer, type EmailStore, type Mailer } from './mail.ts';
import type { PublicStore } from './public.ts';
import type { SignStore } from './sign.ts';
import type { PublicEvent, SubmitStore } from './submit.ts';
import type { VerifyStore } from './verify.ts';

export const env = (k: string) => Deno.env.get(k) || undefined;
export { corsHeaders, json, makeLogger, type Logger };

export const appUrl = () => (env('APP_URL') ?? '').replace(/\/+$/, '');
export function allowedOrigins(): string[] {
  return (env('ALLOWED_ORIGINS') ?? env('APP_URL') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function service() {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
/** A client that acts AS the caller (anon, or the signed-in user): RLS and auth.uid() apply. */
export function asCaller(authHeader: string | null) {
  return createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

/** The Authorization header only when it carries a USER session. supabase-js sends the anon key as a bearer token for
 * signed-out visitors; that must count as anonymous (and stay cacheable). */
export function effectiveAuth(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h || !h.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim() === env('SUPABASE_ANON_KEY') ? null : h;
}

export function mailer(): Mailer | null {
  const apiKey = env('RESEND_API_KEY'),
    from = env('EMAIL_FROM');
  return apiKey && from ? resendMailer({ apiKey, from }) : null;
}
export const captcha = () => turnstileVerifier({ secret: env('CAPTCHA_SECRET') });

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
const callerUser = async (authHeader: string) => {
  const { data, error } = await asCaller(authHeader).auth.getUser();
  return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export function submitStore(): SubmitStore {
  const db = service();
  return {
    rateLimit: rateLimit(db),
    async publicEvent(slug, authHeader) {
      // Anonymous callers use the service role: the RPC is not executable by anon (no direct, unthrottled access).
      const { data } = await (authHeader ? asCaller(authHeader) : service()).rpc(
        'get_public_registration',
        { p_slug: slug },
      );
      return (data as PublicEvent | null) ?? null;
    },
    user: callerUser,
    async eventId(slug) {
      const { data } = await db
        .from('registration_events')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      return data?.id ?? null;
    },
    async create(a) {
      const rows = must(
        await db.rpc('svc_create_registration', {
          p_event_id: a.eventId,
          p_form_version_id: a.formVersionId,
          p_guardian_name: a.guardianName,
          p_guardian_email: a.guardianEmail,
          p_guardian_phone: a.guardianPhone,
          p_guardian_relationship: a.guardianRelationship,
          p_player_first_name: a.first,
          p_player_last_name: a.last,
          p_player_date_of_birth: a.dob,
          p_player_id: a.playerId,
          p_submitted_by: a.submittedBy,
          p_answers: a.answers,
          p_sensitive: a.sensitive,
        }),
      ) as Array<{ id: string; display_id: string; status: string }>;
      return rows[0]!;
    },
    async findPending(eventId, email, first, last, dob) {
      return must(
        await db.rpc('svc_find_pending_registration', {
          p_event_id: eventId,
          p_email: email,
          p_first_name: first,
          p_last_name: last,
          p_date_of_birth: dob,
        }),
      ) as string | null;
    },
    async issueToken(registrationId, hash, ttl, keepExisting = false) {
      must(
        await db.rpc('svc_issue_verification_token', {
          p_registration_id: registrationId,
          p_token_hash: hash,
          p_ttl_minutes: ttl,
          p_keep_existing: keepExisting,
        }),
      );
    },
  };
}

export function verifyStore(): VerifyStore {
  const db = service();
  return {
    rateLimit: rateLimit(db),
    async consume(hash) {
      const rows = must(
        await db.rpc('svc_consume_verification_token', { p_token_hash: hash }),
      ) as Array<{ registration_id: string; display_id: string; status: string }>;
      return rows[0]!;
    },
    async issueSignToken(id, hash, ttl) {
      must(
        await db.rpc('svc_issue_sign_token', {
          p_registration_id: id,
          p_token_hash: hash,
          p_ttl_minutes: ttl,
        }),
      );
    },
    async signingState(id) {
      return must(await db.rpc('svc_registration_signing_state', { p_registration_id: id })) as any;
    },
  };
}

export function signStore(): SignStore {
  const db = service();
  return {
    rateLimit: rateLimit(db),
    user: callerUser,
    async resolveSignToken(hash) {
      return must(await db.rpc('svc_resolve_sign_token', { p_token_hash: hash })) as string | null;
    },
    async signingState(id) {
      return must(await db.rpc('svc_registration_signing_state', { p_registration_id: id })) as any;
    },
    async recordAsUser(authHeader, a) {
      return must(
        await asCaller(authHeader).rpc('record_waiver_acceptance', {
          p_waiver_version_id: a.waiverVersionId,
          p_signer_name: a.signerName,
          p_signer_relationship: a.signerRelationship,
          p_signer_email: a.signerEmail,
          p_consent: a.consent,
          p_registration_id: a.registrationId,
          p_player_id: a.playerId,
        }),
      ) as string;
    },
    async recordAsService(registrationId, a, ip, ua) {
      return must(
        await db.rpc('svc_record_waiver_acceptance', {
          p_registration_id: registrationId,
          p_waiver_version_id: a.waiverVersionId,
          p_signer_name: a.signerName,
          p_signer_relationship: a.signerRelationship,
          p_signer_email: a.signerEmail,
          p_consent: a.consent,
          p_ip: ip,
          p_user_agent: ua,
        }),
      ) as string;
    },
    async recordEvidence(id, ip, ua) {
      must(
        await db.rpc('svc_record_evidence', { p_acceptance_id: id, p_ip: ip, p_user_agent: ua }),
      );
    },
    async context(id) {
      return must(await db.rpc('svc_acceptance_context', { p_acceptance_id: id }));
    },
    async storeCopy(path, bytes) {
      const { error } = await db.storage
        .from('waiver-copies')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (error) throw error;
    },
    async attachCopy(id, path) {
      must(await db.rpc('svc_attach_signed_copy', { p_acceptance_id: id, p_path: path }));
    },
  };
}

export function publicStore(): PublicStore {
  const db = service();
  return {
    rateLimit: rateLimit(db),
    async event(slug, authHeader) {
      const { data } = await (authHeader ? asCaller(authHeader) : service()).rpc(
        'get_public_registration',
        { p_slug: slug },
      );
      return (data as Record<string, any> | null) ?? null;
    },
    async coverUrl(path, expiresIn) {
      const { data } = await db.storage
        .from('registration-covers')
        .createSignedUrl(path, expiresIn);
      return data?.signedUrl ?? null;
    },
  };
}

export function claimStore() {
  const db = service();
  return {
    rateLimit: rateLimit(db),
    user: callerUser,
    async claim(hash: string, userId: string) {
      return must(
        await db.rpc('svc_claim_registration', { p_token_hash: hash, p_user_id: userId }),
      ) as string;
    },
  };
}

export function emailStore(): EmailStore {
  const db = service();
  return {
    async issueClaimToken(registrationId, hash, ttlMinutes) {
      must(
        await db.rpc('svc_issue_claim_token', {
          p_registration_id: registrationId,
          p_token_hash: hash,
          p_ttl_minutes: ttlMinutes,
        }),
      );
    },
    async claim(limit) {
      return must(await db.rpc('claim_registration_emails', { p_limit: limit })) as any;
    },
    async finish(id, attempts, r) {
      const patch =
        r.status === 'sent'
          ? { attempts, status: 'sent', sent_at: new Date().toISOString(), last_error: null }
          : r.status === 'skipped'
            ? { attempts, status: 'skipped', last_error: r.reason }
            : {
                attempts,
                status: 'failed',
                last_error: r.error,
                deliver_after: (r.retryAt ?? new Date(Date.now() + 365 * 86_400_000)).toISOString(),
              };
      await db.from('notification_outbox').update(patch).eq('id', id);
    },
  };
}
