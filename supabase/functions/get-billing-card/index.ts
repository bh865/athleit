// get-billing-card: a team admin sees the card brand and last four (read from Stripe on demand, never stored).
import { getCardSummary, supabaseBillingStore } from '../_shared/payments/billing.ts';
import { json } from '../_shared/payments/http.ts';
import { env, serviceClient, stripeApi, userFunction } from '../_shared/payments/runtime.ts';
import { billingTeamInput } from '../_shared/payments/schemas.ts';

userFunction(
  'get-billing-card',
  (b) => billingTeamInput.safeParse(b),
  { perMinute: 20 },
  async ({ input, log, user$ }) => {
    const r = await getCardSummary(input.teamId, {
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
