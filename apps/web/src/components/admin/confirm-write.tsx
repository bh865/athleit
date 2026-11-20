'use client';

import { isReasonValid, REASON_TOO_SHORT, formatCountdown } from '@athleit/core';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Button, Sheet, Text, TextArea } from '@/components/ui';
import type { ActionResult } from '@/lib/admin/action';
import { adminErrorMessage } from '@/lib/admin/errors';

import { useAdmin } from './admin-provider';
import styles from './confirm-write.module.css';

export interface ChangeRow {
  label: string;
  before: ReactNode;
  after: ReactNode;
}

/**
 * The one anatomy every admin write uses: what changes (before and after), an impact sentence, a reason, the MFA
 * state, then the audit link once saved. Confirming at aal1 opens the step-up sheet, keeps this change, and applies
 * it right after verifying (useAdmin().withEditing). Typed errors map to messages; none is swallowed.
 */
export function ConfirmWrite({
  open, onClose, title, rows, impact, confirmLabel = 'Confirm', onSubmit, onDone, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  rows: readonly ChangeRow[];
  /** One sentence from the copy deck. */
  impact?: ReactNode;
  confirmLabel?: string;
  onSubmit: (reason: string) => Promise<ActionResult<unknown>>;
  onDone?: () => void;
  children?: ReactNode;
}) {
  const { editing, secondsLeft, withEditing } = useAdmin();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const short = !isReasonValid(reason);

  function close() {
    onClose();
    // Reset after the sheet closes so a reopened sheet starts clean.
    setReason(''); setTouched(false); setError(null); setSaved(false);
  }
  function confirm() {
    setTouched(true);
    if (short) return;
    withEditing(async () => {
      setBusy(true);
      setError(null);
      const r = await onSubmit(reason.trim());
      setBusy(false);
      if (r.ok) { setSaved(true); onDone?.(); } else setError(adminErrorMessage(r.code, r.message));
    });
  }

  return (
    <Sheet open={open} onClose={close} title={title} level="modal" role="alertdialog">
      <div className={styles.body}>
        <Text variant="heading" as="h2">{title}</Text>
        {saved ? (
          <>
            <Text variant="body" role="status">Saved. This change is in the audit log.</Text>
            <div className={styles.actions}>
              <Link href="/admin/audit" className={styles.link}>View audit entry</Link>
              <Button onClick={close}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <dl className={styles.rows}>
              {rows.map((r) => (
                <div key={r.label} className={styles.row}>
                  <dt>{r.label}</dt>
                  <dd><span className={styles.before}>{r.before}</span> <span aria-hidden>→</span> <span className={styles.after}>{r.after}</span></dd>
                </div>
              ))}
            </dl>
            {impact ? <Text variant="body" className={styles.impact}>{impact}</Text> : null}
            {children}
            <TextArea
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              error={touched && short ? REASON_TOO_SHORT : undefined}
              hint="Saved to the audit log with your name."
            />
            <Text variant="caption" muted role="status">
              {editing ? `Editing is on, ${formatCountdown(secondsLeft)} left.` : 'Verify to make this change. You’ll be asked for a code when you confirm.'}
            </Text>
            {error ? <Text variant="body" role="alert" className={styles.error}>{error}</Text> : null}
            <div className={styles.actions}>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button loading={busy} onClick={confirm}>{confirmLabel}</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
