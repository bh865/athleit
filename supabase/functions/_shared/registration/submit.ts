// submit-registration core: the ONLY write path for registrations (anonymous and signed in).
// Order matters: cheap checks first (size, honeypot, per-IP limit), then shape, captcha, per-email and per-event
// limits, the event's rules, answer validation against the PUBLISHED form version, and only then the database.
// Never logs answers, emails or tokens: only ids, outcomes and error codes.
import {
  formFieldSchema,
  formSchemaSchema,
  submitRegistrationSchema,
} from './core/schemas/registration.ts';
import { validateAnswers } from './core/registration.ts';
import type { CaptchaVerifier } from './captcha.ts';
import { verificationEmail, type Mailer } from './mail.ts';
import { isDuplicate, mapDbError, sha256Hex, randomToken } from './util.ts';

export interface PublicEvent {
  title: string;
  state: 'upcoming' | 'open' | 'closed';
  requires_account: boolean;
  price_cents: number | null;
  payment_timing: string;
  form: { version_id: string; schema: unknown };
  waivers: Array<{ version_id: string; title: string }>;
}

export interface SubmitStore {
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  publicEvent(slug: string, authHeader: string | null): Promise<PublicEvent | null>;
  user(authHeader: string): Promise<{ id: string } | null>;
  eventId(slug: string): Promise<string | null>;
  create(a: {
    eventId: string;
    formVersionId: string;
    guardianName: string;
    guardianEmail: string;
    guardianPhone: string | null;
    guardianRelationship: string;
    first: string;
    last: string;
    dob: string;
    playerId: string | null;
    submittedBy: string | null;
    answers: Record<string, unknown>;
    sensitive: Record<string, unknown>;
  }): Promise<{ id: string; display_id: string; status: string }>;
  findPending(
    eventId: string,
    email: string,
    first: string,
    last: string,
    dob: string,
  ): Promise<string | null>;
  issueToken(
    registrationId: string,
    hash: string,
    ttlMinutes: number,
    keepExisting?: boolean,
  ): Promise<void>;
}

export interface SubmitDeps {
  store: SubmitStore;
  captcha: CaptchaVerifier;
  mailer: Mailer | null;
  appUrl: string;
  log: (level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) => void;
  token?: () => string;
}

export interface Result {
  status: number;
  body: Record<string, unknown>;
}
export const VERIFY_TTL_MINUTES = 60;
const MAX_FIELDS_REPORTED = 40;

const generic = (): Result => ({
  status: 202,
  body: { ok: true, status: 'pending_verification', next: ['verify_email'] },
});

export async function submitRegistration(
  d: SubmitDeps,
  req: { ip: string; authHeader: string | null; body: unknown },
): Promise<Result> {
  const { store, log } = d;
  const raw =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? { ...(req.body as Record<string, unknown>) }
      : null;
  if (!raw) return { status: 400, body: { error: 'invalid_input' } };

  if (!(await store.rateLimit(`reg-submit:ip:${req.ip}`, 10, 600)))
    return { status: 429, body: { error: 'rate_limited' } };

  // Honeypot: bots fill every field. Pretend it worked; create nothing, send nothing.
  if (typeof raw.website === 'string' && raw.website.length > 0) {
    log('warn', 'honeypot');
    return generic();
  }
  delete raw.website;

  const parsed = submitRegistrationSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '_form')))].slice(
      0,
      MAX_FIELDS_REPORTED,
    );
    return { status: 400, body: { error: 'invalid_input', fields } };
  }
  const input = parsed.data;

  const cap = await d.captcha(input.captchaToken, req.ip);
  if (!cap.ok) {
    log('warn', 'captcha_failed', { reason: cap.reason });
    return { status: 400, body: { error: 'captcha_failed' } };
  }

  const emailKey = (await sha256Hex(input.guardianEmail)).slice(0, 32);
  if (!(await store.rateLimit(`reg-submit:email:${emailKey}`, 5, 3600)))
    return { status: 429, body: { error: 'rate_limited' } };
  if (!(await store.rateLimit(`reg-submit:event:${input.slug}`, 120, 60)))
    return { status: 429, body: { error: 'rate_limited' } };

  let userId: string | null = null;
  if (req.authHeader) {
    const u = await store.user(req.authHeader);
    if (!u) return { status: 401, body: { error: 'not_authenticated' } };
    userId = u.id;
  }

  const event = await store.publicEvent(input.slug, userId ? req.authHeader : null);
  if (!event) return { status: 404, body: { error: 'not_found' } };
  if (event.state === 'upcoming') return { status: 409, body: { error: 'not_open_yet' } };
  if (event.state !== 'open') return { status: 409, body: { error: 'registration_closed' } };
  if (event.requires_account && !userId)
    return { status: 401, body: { error: 'account_required' } };
  if (event.form.version_id !== input.formVersionId)
    return { status: 409, body: { error: 'form_changed' } };

  const schema = formSchemaSchema.safeParse(event.form.schema);
  if (!schema.success) {
    log('error', 'bad_form_schema');
    return { status: 500, body: { error: 'internal_error' } };
  }
  const answers = validateAnswers(schema.data, input.answers);
  if (!answers.ok)
    return { status: 422, body: { error: 'invalid_answers', fields: answers.errors } };

  const eventId = await store.eventId(input.slug);
  if (!eventId) return { status: 404, body: { error: 'not_found' } };

  const emitToken = async (registrationId: string, keepExisting = false) => {
    const token = (d.token ?? randomToken)();
    await store.issueToken(
      registrationId,
      await sha256Hex(token),
      VERIFY_TTL_MINUTES,
      keepExisting,
    );
    if (d.mailer) {
      const mail = verificationEmail({
        appUrl: d.appUrl,
        token,
        eventTitle: event.title,
        minutes: VERIFY_TTL_MINUTES,
      });
      const r = await d.mailer.send({ to: input.guardianEmail, ...mail });
      if (!r.ok) log('warn', 'verification_email_failed', { status: r.status });
    } else log('warn', 'mailer_not_configured');
  };

  try {
    const created = await store.create({
      eventId,
      formVersionId: input.formVersionId,
      guardianName: input.guardianName,
      guardianEmail: input.guardianEmail,
      guardianPhone: input.guardianPhone ?? null,
      guardianRelationship: input.guardianRelationship,
      first: input.playerFirstName,
      last: input.playerLastName,
      dob: input.playerDateOfBirth,
      playerId: input.playerId ?? null,
      submittedBy: userId,
      answers: answers.answers,
      sensitive: answers.sensitive,
    });
    log('info', 'registration_created', { registration: created.id, status: created.status });
    if (!userId) {
      await emitToken(created.id);
      // Identical to the duplicate case: nothing here tells a stranger whether this child was already registered.
      // The registration id is shown once the email is confirmed.
      return generic();
    }
    const next: string[] = [];
    if (event.waivers.length) next.push('sign_waivers');
    if (
      event.price_cents != null &&
      event.payment_timing === 'at_submission' &&
      created.status === 'submitted'
    )
      next.push('pay');
    return {
      status: 201,
      body: {
        ok: true,
        displayId: created.display_id,
        registrationId: created.id,
        status: created.status,
        next,
        waiverVersionIds: event.waivers.map((w) => w.version_id),
      },
    };
  } catch (e) {
    if (isDuplicate(e)) {
      // Never reveal whether this child is already registered to someone who is not signed in.
      if (!userId) {
        const pending = await store.findPending(
          eventId,
          input.guardianEmail,
          input.playerFirstName,
          input.playerLastName,
          input.playerDateOfBirth,
        );
        // keepExisting: re-submitting someone else's details must not invalidate the real registrant's link.
        if (pending) await emitToken(pending, true).catch(() => log('warn', 'resend_refused'));
        return generic();
      }
      return { status: 409, body: { error: 'already_registered' } };
    }
    const m = mapDbError(e);
    log(m.status >= 500 ? 'error' : 'warn', 'create_failed', { code: m.code });
    return { status: m.status, body: { error: m.code } };
  }
}
