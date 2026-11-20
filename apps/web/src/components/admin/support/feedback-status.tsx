'use client';
import { canDo, type PlatformRole } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { feedbackStatusAction } from '@/app/admin/support/actions';
import { Select } from '@/components/ui';

import { ConfirmWrite } from '../confirm-write';

const OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'considering', label: 'Considering' },
  { value: 'planned', label: 'Planned' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'wont_do', label: 'Won’t do' },
] as const;
type S = (typeof OPTIONS)[number]['value'];

/** Read and tag by support; status changes by admin (aal2 and a reason, audited). Support sees the status as text only. */
export function FeedbackStatus({
  id,
  status,
  role,
}: {
  id: string;
  status: string | null;
  role: PlatformRole;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<S | null>(null);
  const label = OPTIONS.find((o) => o.value === status)?.label ?? 'New';
  if (!canDo(role, 'support_feedback_status')) return <span>{label}</span>;
  return (
    <>
      <Select
        label="Status"
        value={status ?? 'new'}
        options={OPTIONS}
        onChange={(e) => setPending(e.target.value as S)}
      />
      <ConfirmWrite
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Change idea status"
        onDone={() => router.refresh()}
        rows={[
          {
            label: 'Status',
            before: label,
            after: OPTIONS.find((o) => o.value === pending)?.label ?? '',
          },
        ]}
        impact="This is written to the platform audit log."
        onSubmit={(why) => feedbackStatusAction(id, pending ?? 'new', why)}
      />
    </>
  );
}
