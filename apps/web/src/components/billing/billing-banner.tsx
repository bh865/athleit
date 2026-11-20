'use client';

import { billingBanner, type BannerTone } from '@athleit/core';
import { ButtonLink, Icon, Text } from '@/components/ui';

import styles from './billing.module.css';
import { useTeamBilling } from './use-team-billing';

const ICON = { info: 'info', warning: 'warning', critical: 'warning-circle' } as const;
const ICON_CLASS: Record<BannerTone, string> = {
  info: styles.iconInfo!,
  warning: styles.iconWarning!,
  critical: styles.iconCritical!,
};

/**
 * One calm banner for the team area: trial ending (last reminder window), payment problem, and paused actions.
 * Admins get the action; coaches and managers get a read-only version that says to ask an admin. Renders nothing
 * while billing is off, while loading, or when there is nothing to say (never a placeholder).
 */
export function BillingBanner({ teamId }: { teamId: string }) {
  const { view, terms } = useTeamBilling(teamId);
  const b = billingBanner(view, new Date(), terms?.trial_reminder_days ?? []);
  if (!b) return null;
  return (
    <div
      className={`${styles.banner} ${styles[b.tone]}`}
      role="status"
      data-testid="billing-banner"
    >
      <span className={ICON_CLASS[b.tone]}>
        <Icon name={ICON[b.tone]} weight="fill" size="lg" />
      </span>
      <div className={styles.grow}>
        <Text variant="bodyBold" as="div">
          {b.title}
        </Text>
        <Text variant="caption" as="div">
          {b.body}
        </Text>
      </div>
      {b.action ? (
        <ButtonLink
          href={`/teams/${teamId}/billing`}
          variant={b.tone === 'critical' ? 'primary' : 'secondary'}
        >
          {b.action === 'subscribe'
            ? 'Subscribe'
            : b.action === 'update_payment'
              ? 'Update payment method'
              : 'Resume'}
        </ButtonLink>
      ) : null}
    </div>
  );
}
