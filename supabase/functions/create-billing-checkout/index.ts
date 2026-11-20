// create-billing-checkout: a team admin starts a Stripe Checkout (subscription mode) on Athleit's platform account.
// Redirect URLs come from APP_URL only; the price is the database's, never the caller's.
import { createBillingCheckout, supabaseBillingStore } from '../_shared/payments/billing.ts';
import { json } from '../_shared/payments/http.ts';
import { env, serviceClient, stripeApi, userFunction } from '../_shared/payments/runtime.ts';
import { billingTeamInput } from '../_shared/payments/schemas.ts';

userFunction(
  'create-billing-checkout',
  (b) => billingTeamInput.safeParse(b),
  { perMinute: 6 },
  async ({ user, input, log, user$ }) => {
    const { data: u } = await user$.auth.getUser();
    const r = await createBillingCheckout(user.id, input.teamId, {
      store: supabaseBillingStore(serviceClient() as any),
      stripe: stripeApi(),
      log,
      appUrl: env('APP_URL') ?? '',
      payerEmail: u.user?.email ?? null,
      viewAsUser: async (teamId) => {
        const { data, error } = await user$.rpc('get_team_billing', { p_team_id: teamId });
        if (error) throw new Error(error.message);
        return data;
      },
    });
    return json(r);
  },
);
