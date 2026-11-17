// connect-onboarding: admins create/continue Stripe Express onboarding. Redirect URLs come from config only.
import { json } from '../_shared/payments/http.ts';
import { connectOnboarding } from '../_shared/payments/onboarding.ts';
import { onboardingInput } from '../_shared/payments/schemas.ts';
import { env, stripeApi, userFunction } from '../_shared/payments/runtime.ts';

userFunction(
  'connect-onboarding',
  (b) => onboardingInput.safeParse(b),
  { perMinute: 10 },
  async ({ user, input, store, log, user$ }) => {
    const owner = input.teamId ? { teamId: input.teamId } : { clubId: input.clubId };
    const r = await connectOnboarding(user.id, owner, input.platform, input.action, {
      store,
      stripe: stripeApi(),
      log,
      appUrl: env('APP_URL') ?? '',
      appScheme: env('APP_SCHEME') ?? 'athleit',
      canManage: async (o) => {
        const { data, error } = await user$.rpc('connected_account_status', {
          p_team_id: o.teamId ?? null,
          p_club_id: o.clubId ?? null,
        });
        if (error) throw new Error(error.message);
        return !!data?.[0]?.can_manage;
      },
    });
    return json(r);
  },
);
