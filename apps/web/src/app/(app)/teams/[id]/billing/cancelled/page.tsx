'use client';

import { useTeam } from '@/components/app/team-context';
import { ButtonLink, Card, Icon, Text } from '@/components/ui';

export default function BillingCancelledPage() {
  const { team } = useTeam();
  return (
    <Card style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} data-testid="billing-cancelled">
      <Icon name="info" size="lg" />
      <Text variant="heading" as="h2">
        You weren’t charged
      </Text>
      <Text variant="body" as="p">
        Checkout was closed before it finished, so nothing changed. You can subscribe whenever you’re ready.
      </Text>
      <div>
        <ButtonLink href={`/teams/${team.id}/billing`}>Back to billing</ButtonLink>
      </div>
    </Card>
  );
}
