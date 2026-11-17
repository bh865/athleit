// Small HTTP helpers shared by the payment Edge Functions.
import { StripeError } from './stripe.ts';

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin && allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : (allowed[0] ?? 'null'),
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
};

export function mapError(err: unknown): { status: number; code: string } {
  const msg = String((err as { message?: string })?.message ?? err);
  for (const [k, v] of Object.entries(DB_ERRORS))
    if (msg.includes(k)) return { status: v[0], code: v[1] };
  if (msg.includes('live_key_refused')) return { status: 500, code: 'live_key_refused' };
  if (err instanceof StripeError || msg.startsWith('stripe_'))
    return { status: 502, code: 'payment_provider_error' };
  return { status: 500, code: 'internal_error' };
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization');
  return h?.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
}
