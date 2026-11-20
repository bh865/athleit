// create-billing-portal-session: a team admin opens Stripe's Billing Portal (payment method and invoices only).
import { createPortalSession, supabaseBillingStore } from '../_shared/payments/billing.ts';
import { json } from '../_shared/payments/http.ts';
import { env, serviceClient, stripeApi, userFunction } from '../_shared/payments/runtime.ts';
import { billingTeamInput } from '../_shared/payments/schemas.ts';

userFunction(
  'create-billing-portal-session',
  (b) => billingTeamInput.safeParse(b),
  { perMinute: 10 },
  async ({ input, log, user$ }) => {
    const r = await createPortalSession(input.teamId, {
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
