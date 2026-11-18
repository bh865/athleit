// verify-registration core: the registrant opens the emailed link. The token is single use, expiring and stored only
// as a hash. Replay, expiry and unknown tokens all return the same answer. A verified anonymous registrant receives a
// short-lived signing token (kept in the response body, never emailed or put in a URL) to sign waivers without an account.
import { randomToken, sha256Hex } from './util.ts';
import type { Result } from './submit.ts';

export interface VerifyStore {
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  consume(
    tokenHash: string,
  ): Promise<{ registration_id: string; display_id: string; status: string }>;
  issueSignToken(registrationId: string, hash: string, ttlMinutes: number): Promise<void>;
  signingState(
    registrationId: string,
  ): Promise<{ waivers: Array<{ version_id: string; title: string; signed: boolean }> } | null>;
}

export const SIGN_TTL_MINUTES = 60;

export async function verifyRegistration(
  d: {
    store: VerifyStore;
    log: (l: 'info' | 'warn' | 'error', e: string, f?: Record<string, unknown>) => void;
    token?: () => string;
  },
  req: { ip: string; body: unknown },
): Promise<Result> {
  const token = (req.body as { token?: unknown } | null)?.token;
  if (
    typeof token !== 'string' ||
    token.length < 20 ||
    token.length > 200 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return { status: 400, body: { error: 'invalid_token' } };
  }
  if (!(await d.store.rateLimit(`reg-verify:ip:${req.ip}`, 20, 600)))
    return { status: 429, body: { error: 'rate_limited' } };
  let consumed;
  try {
    consumed = await d.store.consume(await sha256Hex(token));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes('registration_closed'))
      return { status: 409, body: { error: 'registration_closed' } };
    if (msg.includes('registration_full'))
      return { status: 409, body: { error: 'registration_full' } };
    return { status: 400, body: { error: 'invalid_token' } };
  }
  const signToken = (d.token ?? randomToken)();
  await d.store.issueSignToken(
    consumed.registration_id,
    await sha256Hex(signToken),
    SIGN_TTL_MINUTES,
  );
  const state = await d.store.signingState(consumed.registration_id);
  d.log('info', 'registration_verified', {
    registration: consumed.registration_id,
    status: consumed.status,
  });
  const waivers = (state?.waivers ?? []).map((w) => ({
    versionId: w.version_id,
    title: w.title,
    signed: w.signed,
  }));
  return {
    status: 200,
    body: {
      ok: true,
      displayId: consumed.display_id,
      status: consumed.status,
      signToken,
      next: waivers.some((w) => !w.signed) ? ['sign_waivers'] : [],
      waivers,
    },
  };
}
