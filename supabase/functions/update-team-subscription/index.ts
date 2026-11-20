// update-team-subscription: a team admin cancels (at period end) or resumes. Service never ends early.
import { supabaseBillingStore, updateSubscription } from '../_shared/payments/billing.ts';
import { json } from '../_shared/payments/http.ts';
import { env, serviceClient, stripeApi, userFunction } from '../_shared/payments/runtime.ts';
import { updateSubscriptionInput } from '../_shared/payments/schemas.ts';

userFunction(
  'update-team-subscription',
  (b) => updateSubscriptionInput.safeParse(b),
  { perMinute: 10 },
  async ({ input, log, user$ }) => {
    const r = await updateSubscription(input.teamId, input.action, {
      store: supabaseBillingStore(serviceClient() as any),
      stripe: stripeApi(),
      log,
      appUrl: env('APP_URL') ?? '',
      viewAsUser: async (teamId) => {
        const { data, error } = await user$.rpc('get_team_billing', { p_team_id: teamId });
        if (error) throw new Error(error.message);
        return data;
      },
    });
    return json(r);
  },
);
