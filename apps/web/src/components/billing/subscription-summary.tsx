'use client';

import { daysLeftLabel } from '@athleit/core';

import { Badge, ButtonLink, Card, Icon, Text } from '@/components/ui';

import styles from './billing.module.css';
import { useTeamBilling } from './use-team-billing';

const LABEL = {
  trialing: 'Free trial',
  active: 'Subscribed',
  cancel_scheduled: 'Ends soon',
  past_due: 'Payment problem',
  trial_expired: 'Trial ended',
  lapsed: 'Paused',
  comped: 'Complimentary',
} as const;

/** Settings → Money → Subscription: one line of status and a way into the billing page. Nothing renders while billing is off. */
export function SubscriptionSummary({ teamId }: { teamId: string }) {
  const { view } = useTeamBilling(teamId);
  if (!view || view.state === 'off') return null;
  const detail =
    view.state === 'trialing' && view.trial_ends_at
      ? daysLeftLabel(view.trial_ends_at, new Date())
      : view.state === 'active' && view.current_period_end
        ? `Next charge ${new Date(view.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : null;
  return (
    <Card className={styles.panel} data-testid="subscription-summary">
      <div className={styles.between}>
        <div className={styles.row}>
          <Icon name="credit-card" size="lg" />
          <Text variant="heading" as="h2">
            Subscription
          </Text>
        </div>
        <Badge>{LABEL[view.state]}</Badge>
      </div>
      {detail ? <Text variant="body">{detail}</Text> : null}
      {!view.can_manage ? (
        <Text variant="caption" muted as="p">
          Only a team admin can change billing.
        </Text>
      ) : null}
      <div>
        <ButtonLink href={`/teams/${teamId}/billing`} variant="secondary">
          {view.can_manage ? 'Manage billing' : 'View status'}
        </ButtonLink>
      </div>
    </Card>
  );
}
