// create-payment-intent: the payer sends ONLY ids (requests, installments, or a plan choice). See _shared/payments/intents.ts.
import { createPaymentIntent } from '../_shared/payments/intents.ts';
import { json } from '../_shared/payments/http.ts';
import { createPaymentIntentInput } from '../_shared/payments/schemas.ts';
import { stripeApi, userFunction } from '../_shared/payments/runtime.ts';

userFunction(
  'create-payment-intent',
  (b) => createPaymentIntentInput.safeParse(b),
  { perMinute: 20 },
  async ({ user, input, store, log, req }) => {
    // Consent evidence for a plan with autopay: when, from where. Never logged.
    const meta = {
      ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null,
      userAgent: req.headers.get('user-agent'),
    };
    const r = await createPaymentIntent(user.id, input, { store, stripe: stripeApi(), log }, meta);
    return json(r);
  },
);
