// Cloudflare Turnstile server-side validation (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
// Fails closed: no secret, no token, an unreachable endpoint or any non-success answer all refuse the request.
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type CaptchaVerifier = (
  token: string | undefined,
  ip: string,
) => Promise<{ ok: boolean; reason?: string }>;

export function turnstileVerifier(opts: {
  secret: string | undefined;
  fetch?: typeof fetch;
  url?: string;
}): CaptchaVerifier {
  const f = opts.fetch ?? fetch;
  return async (token, ip) => {
    if (!opts.secret) return { ok: false, reason: 'not_configured' };
    if (!token || token.length > 4096) return { ok: false, reason: 'missing_token' };
    try {
      const body = new URLSearchParams({ secret: opts.secret, response: token });
      if (ip && ip !== 'unknown') body.set('remoteip', ip);
      const res = await f(opts.url ?? TURNSTILE_VERIFY_URL, { method: 'POST', body });
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      return json.success === true
        ? { ok: true }
        : { ok: false, reason: json['error-codes']?.[0] ?? 'failed' };
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
  };
}
