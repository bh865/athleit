import { billingBanner, daysLeftLabel, type TeamBillingView } from '@athleit/core';
import { getBillingTerms, getTeamBilling } from '@athleit/db/billing';
import { space } from '@athleit/tokens';
import { View } from 'react-native';

import { Badge, Card, Icon, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

const LABEL: Record<TeamBillingView['state'], string> = {
  off: 'Not on',
  trialing: 'Free trial',
  active: 'Subscribed',
  cancel_scheduled: 'Ends soon',
  past_due: 'Payment problem',
  trial_expired: 'Trial ended',
  lapsed: 'Paused',
  comped: 'Complimentary',
};

/**
 * Team subscription status, READ-ONLY. There is no Subscribe, payment-method or purchase control and no link out:
 * billing is managed on the web, and the instruction says so in plain words (App Store and Play policy for digital
 * subscriptions is regional; whether to link out is the owner's call after a store-policy check).
 * Renders nothing while billing is off or the caller is not team staff.
 */
export function BillingStatus({ teamId }: { teamId: string }) {
  const view = useLoad(
    async () =>
      (await getTeamBilling(supabase, teamId)) as never as {
        data: TeamBillingView | null;
        error: null;
      },
    [teamId],
  );
  const terms = useLoad(() => getBillingTerms(supabase), []);
  const v = view.data;
  if (!v || v.state === 'off') return null;
  const now = new Date();
  const banner = billingBanner(v, now, terms.data?.trial_reminder_days ?? []);
  const detail =
    v.state === 'trialing' && v.trial_ends_at
      ? daysLeftLabel(v.trial_ends_at, now)
      : v.state === 'active' && v.current_period_end
        ? `Next charge ${new Date(v.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : v.state === 'cancel_scheduled' && v.current_period_end
          ? `Ends ${new Date(v.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : null;
  return (
    <Card style={{ gap: space[3] }} testID="billing-status">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="credit-card" size="md" />
          <Text variant="heading">Subscription</Text>
        </View>
        <Badge>{LABEL[v.state]}</Badge>
      </View>
      {detail ? <Text variant="body">{detail}</Text> : null}
      {banner ? (
        <Text variant="caption" muted accessibilityRole="alert">
          {banner.body}
        </Text>
      ) : null}
      <Text variant="caption" muted>
        {v.can_manage
          ? 'Manage billing on the web at athleit.app.'
          : 'Only a team admin can change billing. Billing is managed on the web at athleit.app.'}
      </Text>
    </Card>
  );
}
