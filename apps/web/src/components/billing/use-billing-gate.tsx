'use client';

import { isBillingRestricted } from '@athleit/core';
import Link from 'next/link';

import { Text } from '@/components/ui';

import { useTeamBilling } from './use-team-billing';

/**
 * Restricted teams cannot publish payment requests or registrations, create invites or approve join requests (the database
 * refuses them with billing_restricted). This tells a control to replace itself with the reason before anyone tries.
 * Only team staff can read billing state; for everyone else, and while billing is off or loading, nothing is restricted.
 */
export function useBillingGate(teamId: string | undefined) {
  const { view } = useTeamBilling(teamId ?? '');
  const restricted = !!teamId && !!view && isBillingRestricted(view.state);
  return { restricted, canManage: !!view?.can_manage, teamId };
}

/** The plain-language reason, with a Subscribe link for admins and "ask an admin" for everyone else. */
export function BillingGateNote({
  gate,
  what,
}: {
  gate: ReturnType<typeof useBillingGate>;
  what: string;
}) {
  if (!gate.restricted) return null;
  return (
    <Text variant="caption" as="p" role="status" data-testid="billing-gate-note">
      {what} is paused because the team’s free trial or subscription has ended.{' '}
      {gate.canManage ? (
        <Link href={`/teams/${gate.teamId}/billing`}>Subscribe to turn it back on</Link>
      ) : (
        'Ask a team admin to subscribe.'
      )}
    </Text>
  );
}
