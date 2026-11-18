import { REGISTRATION_STATUS_LABELS, registrationStatusTone } from '@athleit/core';

import { Badge } from '@/components/ui';

export function RegistrationStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={registrationStatusTone(status)}>
      {REGISTRATION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
