// connect-onboarding core: Express account creation + Account Link. Authorization is the database's
// (connected_account_status.can_manage, evaluated for the signed-in user), never a client claim.
import type { Logger } from './log.ts';
import { applyAccount } from './handlers.ts';
import type { Owner, Store } from './store.ts';
import type { StripeApi } from './stripe.ts';

export interface OnboardingDeps {
  store: Store;
  stripe: Pick<StripeApi, 'get' | 'post'>;
  log: Logger;
  /** Calls public.connected_account_status as the signed-in user; true only for issuer admins. */
  canManage: (o: Owner) => Promise<boolean>;
  appUrl: string;
  appScheme: string;
}

/** Return/refresh URLs are built here from configuration; a client can never supply a redirect target. */
export function onboardingUrls(
  o: Owner,
  platform: 'web' | 'mobile',
  appUrl: string,
  appScheme: string,
) {
  const owner = o.teamId ? `team=${o.teamId}` : `club=${o.clubId}`;
  const base =
    platform === 'web'
      ? `${appUrl.replace(/\/$/, '')}/payments/connect`
      : `${appScheme}://payments/connect`;
  return { return_url: `${base}/return?${owner}`, refresh_url: `${base}/refresh?${owner}` };
}

export async function connectOnboarding(
  userId: string,
  o: Owner,
  platform: 'web' | 'mobile',
  action: 'link' | 'sync',
  d: OnboardingDeps,
): Promise<{ url?: string; onboardingStatus?: string }> {
  if (!(await d.canManage(o))) throw new Error('not_authorized');
  let acct = await d.store.getConnectedAccount(o);
  if (!acct) {
    const key = `athleit:acct:${o.teamId ? 'team' : 'club'}:${o.teamId ?? o.clubId}`;
    const created = await d.stripe.post(
      '/v1/accounts',
      {
        type: 'express',
        country: 'US',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { athleit_owner: `${o.teamId ? 'team' : 'club'}:${o.teamId ?? o.clubId}` }, // ids only
      },
      key,
    );
    try {
      await d.store.insertConnectedAccount(o, created.id, userId);
    } catch (e) {
      // Lost a race with another admin: the unique owner constraint kept exactly one account.
      acct = await d.store.getConnectedAccount(o);
      if (!acct) throw e;
    }
    acct ??= { stripeAccountId: created.id };
    d.log('info', 'onboarding.account_created', { owner: o });
  }
  const live = await d.stripe.get(`/v1/accounts/${acct.stripeAccountId}`);
  await applyAccount(live, d);
  if (action === 'sync')
    return {
      onboardingStatus: live.charges_enabled && live.details_submitted ? 'ready' : 'pending',
    };
  const urls = onboardingUrls(o, platform, d.appUrl, d.appScheme);
  const link = await d.stripe.post('/v1/account_links', {
    account: acct.stripeAccountId,
    type: 'account_onboarding',
    ...urls,
  });
  return { url: link.url };
}
