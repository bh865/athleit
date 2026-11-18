// sign-waiver core. Two ways in:
//   * a signed-in guardian: the acceptance is recorded under THEIR identity (record_waiver_acceptance checks that the
//     registration or child is theirs), so ownership rules live in the database;
//   * a verified anonymous registrant: a signing token (hashed, expiring) resolves to ONE registration.
// Then: generate the signed-copy PDF, store it privately, attach its path (set once), and email the signer a copy.
import { waiverAcceptanceSchema } from './core/schemas/registration.ts';
import { buildWaiverPdf, toBase64, type PdfLib } from './waiver-pdf.ts';
import { waiverCopyEmail, type Mailer } from './mail.ts';
import { mapDbError, sha256Hex } from './util.ts';
import type { Result } from './submit.ts';

export interface SignStore {
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  user(authHeader: string): Promise<{ id: string } | null>;
  resolveSignToken(hash: string): Promise<string | null>;
  signingState(registrationId: string): Promise<{
    display_id: string;
    waivers: Array<{
      version_id: string;
      title: string;
      body: string;
      content_hash: string;
      signed: boolean;
    }>;
  } | null>;
  /** Signed-in path: runs record_waiver_acceptance AS the user. */
  recordAsUser(authHeader: string, a: SignArgs): Promise<string>;
  /** Token path: svc_record_waiver_acceptance with the service role. */
  recordAsService(
    registrationId: string,
    a: SignArgs,
    ip: string | null,
    ua: string | null,
  ): Promise<string>;
  recordEvidence(acceptanceId: string, ip: string, ua: string): Promise<void>;
  context(acceptanceId: string): Promise<any>;
  storeCopy(path: string, bytes: Uint8Array): Promise<void>;
  attachCopy(acceptanceId: string, path: string): Promise<void>;
}
export interface SignArgs {
  waiverVersionId: string;
  registrationId: string | null;
  playerId: string | null;
  signerName: string;
  signerRelationship: string;
  signerEmail: string;
  consent: boolean;
}

export async function signWaiver(
  d: {
    store: SignStore;
    mailer: Mailer | null;
    pdf: PdfLib;
    appUrl: string;
    recordEvidence: boolean;
    log: (l: 'info' | 'warn' | 'error', e: string, f?: Record<string, unknown>) => void;
  },
  req: { ip: string; userAgent: string; authHeader: string | null; body: unknown },
): Promise<Result> {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const signToken = typeof b.signToken === 'string' ? b.signToken : null;
  if (!(await d.store.rateLimit(`reg-sign:ip:${req.ip}`, 30, 600)))
    return { status: 429, body: { error: 'rate_limited' } };

  let userId: string | null = null;
  let tokenRegistration: string | null = null;
  if (signToken) {
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(signToken))
      return { status: 401, body: { error: 'invalid_token' } };
    tokenRegistration = await d.store.resolveSignToken(await sha256Hex(signToken));
    if (!tokenRegistration) return { status: 401, body: { error: 'invalid_token' } };
  } else if (req.authHeader) {
    const u = await d.store.user(req.authHeader);
    if (!u) return { status: 401, body: { error: 'not_authenticated' } };
    userId = u.id;
  } else return { status: 401, body: { error: 'not_authenticated' } };

  // State request: which waivers remain (with their text), for the signing screen. Token path only.
  if (b.action === 'state') {
    if (!tokenRegistration) return { status: 400, body: { error: 'invalid_input' } };
    const state = await d.store.signingState(tokenRegistration);
    if (!state) return { status: 404, body: { error: 'not_found' } };
    return {
      status: 200,
      body: {
        displayId: state.display_id,
        waivers: state.waivers.map((w) => ({
          versionId: w.version_id,
          title: w.title,
          body: w.body,
          contentHash: w.content_hash,
          signed: w.signed,
        })),
      },
    };
  }

  const parsed = waiverAcceptanceSchema.safeParse({
    waiverVersionId: b.waiverVersionId,
    registrationId: tokenRegistration ?? b.registrationId,
    playerId: b.playerId,
    signerName: b.signerName,
    signerRelationship: b.signerRelationship,
    signerEmail: b.signerEmail,
    electronicConsent: b.electronicConsent,
  });
  if (!parsed.success)
    return {
      status: 400,
      body: {
        error: 'invalid_input',
        fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))],
      },
    };
  const v = parsed.data;
  // A token can only ever sign for the registration it was issued for.
  if (
    tokenRegistration &&
    ((b.registrationId && b.registrationId !== tokenRegistration) || b.playerId)
  ) {
    return { status: 400, body: { error: 'invalid_input' } };
  }
  const args: SignArgs = {
    waiverVersionId: v.waiverVersionId,
    registrationId: v.registrationId ?? null,
    playerId: v.playerId ?? null,
    signerName: v.signerName,
    signerRelationship: v.signerRelationship,
    signerEmail: v.signerEmail,
    consent: v.electronicConsent,
  };

  let acceptanceId: string;
  try {
    if (tokenRegistration) {
      acceptanceId = await d.store.recordAsService(
        tokenRegistration,
        args,
        d.recordEvidence ? req.ip : null,
        d.recordEvidence ? req.userAgent : null,
      );
    } else {
      acceptanceId = await d.store.recordAsUser(req.authHeader!, args);
      if (d.recordEvidence)
        await d.store
          .recordEvidence(acceptanceId, req.ip, req.userAgent)
          .catch(() => d.log('warn', 'evidence_failed'));
    }
  } catch (e) {
    const m = String((e as Error)?.message ?? e).includes('duplicate key')
      ? { status: 409, code: 'already_signed' }
      : mapDbError(e);
    d.log(m.status >= 500 ? 'error' : 'warn', 'sign_failed', { code: m.code });
    return { status: m.status, body: { error: m.code } };
  }

  // The signature is recorded and append-only. Copy generation is best-effort and repeatable by support;
  // a failure never un-signs, it is reported as copy: 'pending'.
  let copy: 'emailed' | 'stored' | 'pending' = 'pending';
  try {
    const ctx = await d.store.context(acceptanceId);
    const bytes = await buildWaiverPdf(d.pdf, {
      waiver: ctx.waiver,
      signer: {
        name: ctx.signer_name,
        relationship: ctx.signer_relationship,
        email: ctx.signer_email,
      },
      acceptedAt: new Date(ctx.accepted_at).toISOString(),
      electronicConsent: ctx.electronic_consent,
      registrationDisplayId: ctx.registration_display_id ?? null,
      playerName: ctx.player_name ?? null,
      subject: ctx.subject ?? null,
    });
    const path = `wc/${acceptanceId}.pdf`;
    await d.store.storeCopy(path, bytes);
    await d.store.attachCopy(acceptanceId, path);
    copy = 'stored';
    if (d.mailer) {
      const mail = waiverCopyEmail({
        appUrl: d.appUrl,
        waiverTitle: ctx.waiver.title,
        subject: ctx.subject ?? '',
        filename: `signed-${String(ctx.waiver.title)
          .replace(/[^A-Za-z0-9]+/g, '-')
          .slice(0, 40)}.pdf`,
        pdfBase64: toBase64(bytes),
      });
      const r = await d.mailer.send({ to: ctx.signer_email, ...mail });
      if (r.ok) copy = 'emailed';
      else d.log('warn', 'copy_email_failed', { status: r.status });
    }
  } catch (e) {
    d.log('error', 'copy_failed', { reason: String((e as Error)?.message ?? e).slice(0, 60) });
  }
  d.log('info', 'waiver_signed', { acceptance: acceptanceId, copy });
  return { status: 201, body: { ok: true, acceptanceId, copy } };
}
