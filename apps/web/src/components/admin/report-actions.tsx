'use client';

import { canDo } from '@athleit/core';
import type { PlatformRole } from '@athleit/core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { revealReportAction, reviewReportAction } from '@/app/admin/actions';
import { Button, Text } from '@/components/ui';

import { ConfirmWrite } from './confirm-write';

/** Action or dismiss (support), and the audited reveal (admin, with a reason). Only the reported message is ever shown. */
export function ReportActions({ reportId, status, role }: { reportId: string; status: string; role: PlatformRole }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | 'action' | 'dismiss' | 'reveal'>(null);
  const [body, setBody] = useState<{ text: string; sender: string | null; removed: boolean } | null>(null);
  const open = status === 'open';
  const close = () => setMode(null);
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      <Button variant="secondary" disabled={!open} onClick={() => setMode('action')}>Action</Button>
      <Button variant="ghost" disabled={!open} onClick={() => setMode('dismiss')}>Dismiss</Button>
      <Button variant="ghost" disabled={!canDo(role, 'reveal_message')} title={canDo(role, 'reveal_message') ? undefined : 'Needs the admin role'} onClick={() => setMode('reveal')}>Reveal message</Button>
      <ConfirmWrite open={mode === 'action' || mode === 'dismiss'} onClose={close} title={mode === 'action' ? 'Action this report' : 'Dismiss this report'} onDone={() => router.refresh()}
        rows={[{ label: 'Report', before: 'Open', after: mode === 'action' ? 'Actioned' : 'Dismissed' }]}
        onSubmit={(why) => reviewReportAction(reportId, mode === 'action' ? 'action' : 'dismiss', why)} />
      <ConfirmWrite open={mode === 'reveal'} onClose={() => { close(); setBody(null); }} title="Reveal reported message" confirmLabel="Reveal"
        rows={[{ label: 'Message', before: 'Hidden', after: 'Shown to you' }]}
        impact="This is audited. Revealing is written to the platform audit log with your name, the report and your reason. Only the reported message is shown."
        onSubmit={async (why) => {
          const r = await revealReportAction(reportId, why);
          if (r.ok) setBody({ text: r.data.body, sender: r.data.sender, removed: r.data.removed });
          return r;
        }}>
        {body ? <Text variant="body" as="blockquote">{body.removed ? '(removed by the team) ' : ''}{body.sender ? `${body.sender}: ` : ''}{body.text || '(empty)'}</Text> : null}
      </ConfirmWrite>
    </div>
  );
}
