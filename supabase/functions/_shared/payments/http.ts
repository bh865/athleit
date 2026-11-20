// Small HTTP helpers shared by the payment Edge Functions.
import { StripeError } from './stripe.ts';

const norm = (o: string) => o.trim().replace(/\/+$/, '');

/**
 * The browser's Origin must be one we list (APP_URL / ALLOWED_ORIGINS, trailing slashes ignored). In TEST mode only, any
 * http://localhost:<port> is also accepted so local development works without configuration.
 */
export function corsHeaders(
  origin: string | null,
  allowed: string[],
  testMode = false,
): Record<string, string> {
  const list = allowed.map(norm).filter(Boolean);
  const ok =
    !!origin &&
    (list.includes(norm(origin)) ||
      (testMode && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)));
  return {
    'access-control-allow-origin': ok ? (origin as string) : (list[0] ?? 'null'),
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    vary: 'origin',
  };
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}

/** Database errors we surface to the caller (codes only; never raw messages). */
const DB_ERRORS: Record<string, [number, string]> = {
  not_authorized: [403, 'not_authorized'],
  not_authenticated: [401, 'not_authenticated'],
  request_not_payable: [409, 'request_not_payable'],
  mixed_checkout: [409, 'mixed_checkout'],
  mixed_household: [409, 'mixed_household'],
  account_not_ready: [409, 'account_not_ready'],
  invalid_request_set: [400, 'invalid_request_set'],
  not_refundable: [409, 'not_refundable'],
  refund_exceeds_payment: [409, 'refund_exceeds_payment'],
  nothing_to_refund: [409, 'nothing_to_refund'],
  amount_needs_item: [400, 'amount_needs_item'],
  invalid_amount: [400, 'invalid_amount'],
  plan_not_offered: [409, 'plan_not_offered'],
  plan_locked: [409, 'plan_locked'],
  plan_request_use_installments: [409, 'plan_request_use_installments'],
  billing_disabled: [409, 'billing_disabled'],
  already_subscribed: [409, 'already_subscribed'],
  not_subscribed: [409, 'not_subscribed'],
  billing_unavailable: [503, 'billing_unavailable'],
};

export function mapError(err: unknown): { status: number; code: string } {
  const msg = String((err as { message?: string })?.message ?? err);
  for (const [k, v] of Object.entries(DB_ERRORS))
    if (msg.includes(k)) return { status: v[0], code: v[1] };
  if (msg.includes('live_key_refused')) return { status: 500, code: 'live_key_refused' };
  if (msg.includes('stripe_key_missing') || msg.includes('stripe_key_invalid'))
    return { status: 500, code: 'stripe_not_configured' };
  if (err instanceof StripeError || msg.startsWith('stripe_'))
    return { status: 502, code: 'payment_provider_error' };
  return { status: 500, code: 'internal_error' };
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  return h?.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
}
