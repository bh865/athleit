'use client';

import type { ReactNode } from 'react';

import { Button } from './button';
import { Sheet } from './sheet';
import { Text } from './text';

/**
 * Confirmation dialog for destructive or irreversible actions (leave, sign out everywhere, delete).
 * The cancel action is first and gets the safe label; Esc and the backdrop also cancel.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy,
  confirmDisabled,
  alert,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  /** Announce as an alert dialog (for irreversible or access-granting confirms). */
  alert?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      level="modal"
      role={alert ? 'alertdialog' : 'dialog'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Text variant="heading" as="h2">
          {title}
        </Text>
        {children}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} loading={busy} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
