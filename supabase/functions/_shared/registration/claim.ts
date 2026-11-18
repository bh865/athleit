// claim-registration core: a signed-in user attaches an anonymous registration to their account by presenting the
// single-use claim token that was emailed to the registration's verified address. Possession of that token is the proof;
// an account whose email merely looks the same (or was auto-confirmed at signup) proves nothing.
import { sha256Hex } from './util.ts';
import type { Result } from './submit.ts';

export interface ClaimStore {
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  user(authHeader: string): Promise<{ id: string } | null>;
  claim(tokenHash: string, userId: string): Promise<string>;
}

export async function claimRegistration(
  d: {
    store: ClaimStore;
    log: (l: 'info' | 'warn' | 'error', e: string, f?: Record<string, unknown>) => void;
  },
  req: { ip: string; authHeader: string | null; body: unknown },
): Promise<Result> {
  if (!req.authHeader) return { status: 401, body: { error: 'not_authenticated' } };
  const token = (req.body as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(token))
    return { status: 400, body: { error: 'invalid_token' } };
  const u = await d.store.user(req.authHeader);
  if (!u) return { status: 401, body: { error: 'not_authenticated' } };
  if (!(await d.store.rateLimit(`reg-claim:user:${u.id}`, 10, 600)))
    return { status: 429, body: { error: 'rate_limited' } };
  try {
    const registrationId = await d.store.claim(await sha256Hex(token), u.id);
    d.log('info', 'registration_claimed', { registration: registrationId });
    return { status: 200, body: { ok: true, registrationId } };
  } catch {
    return { status: 400, body: { error: 'invalid_token' } };
  }
}
