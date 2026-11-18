// Registration email: templates, a Resend sender (with attachments) and the outbox processor.
// Registrant emails are transactional: they are sent regardless of notification preferences. Plain text only, so
// nothing user-authored can become markup. Nothing here logs addresses, tokens or bodies.
import { formatMoney, oneLine, randomToken, sha256Hex } from './util.ts';

export const CLAIM_TTL_MINUTES = 14 * 24 * 60;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; contentBase64: string }>;
}
export interface Mailer {
  send(msg: EmailMessage): Promise<{ ok: boolean; status: number }>;
}

export function resendMailer(opts: {
  apiKey: string;
  from: string;
  url?: string;
  fetch?: typeof fetch;
}): Mailer {
  const f = opts.fetch ?? fetch;
  return {
    async send(msg) {
      const res = await f(opts.url ?? 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: opts.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          ...(msg.attachments?.length
            ? {
                attachments: msg.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.contentBase64,
                })),
              }
            : {}),
        }),
      });
      return { ok: res.ok, status: res.status };
    },
  };
}

type P = Record<string, unknown>;
const link = (appUrl: string, path: string) => `${appUrl.replace(/\/+$/, '')}${path}`;

export function verificationEmail(args: {
  appUrl: string;
  token: string;
  eventTitle: string;
  minutes: number;
}): Omit<EmailMessage, 'to'> {
  // The token rides in the URL fragment: it is never sent to a server, a log or a Referer header.
  const url = link(args.appUrl, `/register/verify#token=${args.token}`);
  return {
    subject: `Confirm your registration: ${oneLine(args.eventTitle, 80)}`,
    text: [
      `Confirm your email to finish registering for ${oneLine(args.eventTitle, 120)}.`,
      '',
      `Open this link within ${args.minutes} minutes (it works once):`,
      url,
      '',
      'If you did not start a registration, ignore this email and nothing will happen.',
    ].join('\n'),
  };
}

export function waiverCopyEmail(args: {
  appUrl: string;
  waiverTitle: string;
  subject: string;
  filename: string;
  pdfBase64: string;
}): Omit<EmailMessage, 'to'> {
  return {
    subject: `Your signed copy: ${oneLine(args.waiverTitle, 80)}`,
    text: [
      `Attached is your signed copy of "${oneLine(args.waiverTitle, 120)}" for ${oneLine(args.subject, 120)}.`,
      'Keep it for your records. It was recorded electronically at the time you signed.',
    ].join('\n'),
    attachments: [{ filename: args.filename, contentBase64: args.pdfBase64 }],
  };
}

/** Render a queued registrant email. Unknown templates return null (the row is skipped, never sent blank). */
export function renderRegistrationEmail(
  template: string,
  p: P,
  appUrl: string,
  claimUrl?: string,
): Omit<EmailMessage, 'to'> | null {
  const id = oneLine(p.display_id, 20);
  const event = oneLine(p.event_title, 120);
  const issuer = oneLine(p.issuer_name, 100);
  const first = oneLine(p.player_first_name, 60);
  const note =
    typeof p.note === 'string' && p.note
      ? `\nMessage from ${issuer || 'the organizer'}:\n${String(p.note).slice(0, 1000)}\n`
      : '';
  const price = typeof p.price_cents === 'number' ? formatMoney(p.price_cents) : '';
  const needsAccount = p.needs_account === true;
  const signIn = link(appUrl, '/registrations');
  const account = needsAccount
    ? `\nTo continue, sign in or create an Athleit account, then open this link once to attach the registration to your account:\n${claimUrl ?? link(appUrl, '/sign-up')}\nThe link only works for the person who received this email; do not forward it.\n`
    : `\nView it here: ${signIn}\n`;
  switch (template) {
    case 'received':
      return {
        subject: `Registration ${id} received`,
        text: [
          `We received registration ${id} for ${first} in ${event}${issuer ? ` (${issuer})` : ''}.`,
          p.status === 'waitlisted'
            ? 'The event is full, so you are on the waitlist. We will email you if a spot opens.'
            : 'The organizer will review it and email you their decision.',
          account,
        ].join('\n'),
      };
    case 'decision': {
      const status = String(p.status);
      const head =
        status === 'accepted'
          ? `Good news: registration ${id} for ${first} in ${event} was accepted.`
          : status === 'waitlisted'
            ? `Registration ${id} for ${first} in ${event} is on the waitlist.`
            : `Registration ${id} for ${first} in ${event} was not accepted.`;
      const pay =
        status === 'accepted' && price && p.payment_timing === 'after_acceptance'
          ? `\nPayment of ${price} is now due.${needsAccount ? '' : `\nPay here: ${signIn}`}\n`
          : '';
      return {
        subject: `Registration ${id}: ${status}`,
        text: [
          head,
          note,
          pay,
          needsAccount && status === 'accepted' ? account : `View it here: ${signIn}`,
        ].join('\n'),
      };
    }
    case 'promoted': {
      const held = p.payment_timing === 'at_submission' && price;
      return {
        subject: `A spot opened for ${first}: ${id}`,
        text: [
          `A spot opened up in ${event}, and registration ${id} for ${first} moved off the waitlist.`,
          held
            ? `Pay ${price} within ${Number(p.hold_minutes) || 60} minutes to keep the spot.`
            : 'The organizer will confirm the details.',
          note,
          `Open it here: ${signIn}`,
        ].join('\n'),
      };
    }
    case 'payment_due':
      return {
        subject: `Payment due for ${id}`,
        text: [
          `Payment of ${price} is due for registration ${id} in ${event}.`,
          `Pay here: ${signIn}`,
        ].join('\n'),
      };
    case 'hold_expired':
      return {
        subject: `Registration ${id} released`,
        text: [
          `The payment window for registration ${id} (${event}) ended, so the spot was released.`,
          'You can register again if spots remain.',
        ].join('\n'),
      };
    default:
      return null;
  }
}

// Outbox processing --------------------------------------------------------------------------------
export interface EmailRow {
  id: string;
  recipient_email: string;
  payload: P;
  attempts: number;
}
export interface EmailStore {
  claim(limit: number): Promise<EmailRow[]>;
  /** Mint a single-use claim token for an anonymous registration; the raw token is only ever put in the email. */
  issueClaimToken(registrationId: string, tokenHash: string, ttlMinutes: number): Promise<void>;
  finish(
    id: string,
    attempts: number,
    r:
      | { status: 'sent' }
      | { status: 'skipped'; reason: string }
      | { status: 'failed'; error: string; retryAt: Date | null },
  ): Promise<void>;
}

export async function processRegistrationEmails(
  store: EmailStore,
  mailer: Mailer | null,
  appUrl: string,
  now: () => Date = () => new Date(),
): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const rows = await store.claim(50);
  for (const row of rows) {
    let claimUrl: string | undefined;
    if (
      mailer &&
      appUrl &&
      row.payload.needs_account === true &&
      typeof row.payload.registration_id === 'string'
    ) {
      try {
        const token = randomToken();
        await store.issueClaimToken(
          row.payload.registration_id,
          await sha256Hex(token),
          CLAIM_TTL_MINUTES,
        );
        claimUrl = link(appUrl, `/register/claim#token=${token}`);
      } catch {
        /* not claimable (declined, claimed, erased): the email still goes out without a link */
      }
    }
    const content = renderRegistrationEmail(
      String(row.payload.template),
      row.payload,
      appUrl,
      claimUrl,
    );
    if (!mailer || !appUrl) {
      await store.finish(row.id, row.attempts, {
        status: 'skipped',
        reason: 'channel_not_configured',
      });
      out.skipped++;
      continue;
    }
    if (!content) {
      await store.finish(row.id, row.attempts, { status: 'skipped', reason: 'unknown_template' });
      out.skipped++;
      continue;
    }
    try {
      const r = await mailer.send({ to: row.recipient_email, ...content });
      if (r.ok) {
        await store.finish(row.id, row.attempts, { status: 'sent' });
        out.sent++;
      } else throw new Error(`http_${r.status}`);
    } catch (e) {
      const attempts = row.attempts + 1;
      const retryAt =
        attempts >= 5 ? null : new Date(now().getTime() + Math.min(60, 2 ** attempts) * 60_000);
      await store.finish(row.id, attempts, {
        status: 'failed',
        error: String((e as Error).message).slice(0, 100),
        retryAt,
      });
      out.failed++;
    }
  }
  return out;
}
