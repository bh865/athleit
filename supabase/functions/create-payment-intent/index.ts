// create-payment-intent: the payer sends ONLY request ids. See _shared/payments/intents.ts.
import { createPaymentIntent } from '../_shared/payments/intents.ts';
import { json } from '../_shared/payments/http.ts';
import { createPaymentIntentInput } from '../_shared/payments/schemas.ts';
import { stripeApi, userFunction } from '../_shared/payments/runtime.ts';

userFunction(
  'create-payment-intent',
  (b) => createPaymentIntentInput.safeParse(b),
  { perMinute: 20 },
  async ({ user, input, store, log }) => {
    const r = await createPaymentIntent(user.id, input.requestIds, {
      store,
      stripe: stripeApi(),
      log,
    });
    return json(r);
  },
);
