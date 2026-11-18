// Small helpers for the registration Edge Functions. Web-standard APIs only (runs in Deno and in tests).

export function clientIp(h: Headers): string {
  const raw =
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',').at(-1) ??
    h.get('x-real-ip') ??
    '';
  const ip = raw.trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : 'unknown';
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export type BodyResult =
  { ok: true; value: unknown } | { ok: false; status: number; error: string };

/** Read a JSON body with a hard size cap (checked on the declared length AND the real length). */
export async function readJsonBody(req: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return { ok: false, status: 413, error: 'payload_too_large' };
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes)
    return { ok: false, status: 413, error: 'payload_too_large' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
}

/** Database error codes we pass through to clients (codes only: never raw messages). */
const DB_ERRORS: Array<[string, number, string]> = [
  ['registration_full', 409, 'registration_full'],
  ['registration_closed', 409, 'registration_closed'],
  ['not_open_yet', 409, 'not_open_yet'],
  ['form_version_mismatch', 409, 'form_changed'],
  ['not_eligible', 422, 'not_eligible'],
  ['account_required', 401, 'account_required'],
  ['player_required', 422, 'player_required'],
  ['player_not_yours', 403, 'forbidden'],
  ['unknown_answer', 422, 'invalid_answers'],
  ['invalid_answers', 422, 'invalid_answers'],
  ['consent_required', 422, 'consent_required'],
  ['waiver_not_part_of_event', 409, 'waiver_not_part_of_event'],
  ['waiver_version_outdated', 409, 'waiver_version_outdated'],
  ['registration_closed', 409, 'registration_closed'],
  ['invalid_token', 400, 'invalid_token'],
  ['verification_required', 409, 'verification_required'],
  ['forbidden', 403, 'forbidden'],
  ['not_authenticated', 401, 'not_authenticated'],
  ['sensitive_forbidden', 403, 'sensitive_forbidden'],
  ['duplicate key', 409, 'already_registered'],
];

export function mapDbError(err: unknown): { status: number; code: string } {
  const msg = String((err as { message?: string })?.message ?? err);
  for (const [needle, status, code] of DB_ERRORS) if (msg.includes(needle)) return { status, code };
  return { status: 500, code: 'internal_error' };
}

export function isDuplicate(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === '23505' || String(e?.message ?? '').includes('duplicate key');
}

export function formatMoney(cents: number | null | undefined): string {
  if (typeof cents !== 'number') return '';
  return `$${(cents / 100).toFixed(2)}`;
}

/** Keep one line, no control characters (for email subjects and plain-text interpolation). */
export function oneLine(s: unknown, max = 200): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}
