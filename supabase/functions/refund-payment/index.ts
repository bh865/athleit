// refund-payment: issuer admins only (enforced inside public.prepare_refund as the signed-in user).
import { json } from '../_shared/payments/http.ts';
import { refundPayment } from '../_shared/payments/refunds.ts';
import { refundInput } from '../_shared/payments/schemas.ts';
import { stripeApi, userFunction } from '../_shared/payments/runtime.ts';

userFunction(
  'refund-payment',
  (b) => refundInput.safeParse(b),
  { perMinute: 10 },
  async ({ input, store, log, user$ }) => {
    const results = await refundPayment(input, {
      store,
      stripe: stripeApi(),
      log,
      prepare: async (a) => {
        const { data, error } = await user$.rpc('prepare_refund', {
          p_payment_id: a.paymentId,
          p_item_id: a.paymentItemId ?? null,
          p_base_cents: a.baseCents ?? null,
          p_reason: a.reason ?? null,
        });
        if (error) throw new Error(error.message);
        return data;
      },
    });
    return json({ refunds: results });
  },
);
