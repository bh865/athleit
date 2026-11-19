'use client';

import { approveQuestion, formatFamilyCode, friendlyError, spellCode } from '@athleit/core';
import {
  decideHouseholdJoinRequest,
  getHouseholdJoinCode,
  getHouseholdJoinRequests,
  rotateHouseholdJoinCode,
} from '@athleit/db/api';
import { useState } from 'react';

import { Button, ConfirmSheet, Icon, useToast } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

import styles from './app.module.css';
import { FormMessage, LoadState } from './states';

/**
 * The Code tab of the household invite card: the family code (copy, share, rotate behind a
 * confirm) and the guardian requests that code produced. A code only queues a request; a guardian
 * approves it here.
 */
export function FamilyCodePanel({
  householdId,
  childNames,
}: {
  householdId: string;
  childNames: readonly string[];
}) {
  const client = getClient();
  const toast = useToast();
  const code = useLoad(() => getHouseholdJoinCode(client, householdId), [householdId]);
  const requests = useLoad(() => getHouseholdJoinRequests(client, householdId), [householdId]);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<{ id: string; name: string } | null>(null);

  const value = code.data?.join_code ?? '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast('Family code copied');
    } catch {
      toast('Could not copy the code. Select it and copy by hand.', 'danger');
    }
  }
  async function share() {
    const text = `Join our family on Athleit with this code: ${value}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
      } catch {
        /* dismissed */
      }
    } else await copy();
  }
  async function rotate() {
    setBusy(true);
    setError(null);
    const res = await rotateHouseholdJoinCode(client, householdId);
    setBusy(false);
    setRotateOpen(false);
    if (res.error)
      return setError(
        "Couldn't generate a new code. Your current code still works. Try again in a moment.",
      );
    toast('New code generated. The old one no longer works.');
    code.reload();
  }
  async function decide(id: string, approve: boolean) {
    setBusy(true);
    setError(null);
    const res = await decideHouseholdJoinRequest(client, id, approve);
    setBusy(false);
    setApproving(null);
    if (res.error) setError(friendlyError(res.error));
    requests.reload();
  }

  return (
    <div className={styles.stack}>
      <LoadState loading={code.loading} error={code.error} onRetry={code.reload}>
        <span className={styles.muted}>Family code</span>
        <div className={styles.codeRow}>
          <span className={styles.code} data-testid="family-code" aria-hidden>
            {formatFamilyCode(value)}
          </span>
          <span className={styles.visuallyHidden}>Family code: {spellCode(value)}</span>
          <Button variant="secondary" onClick={() => void copy()}>
            <Icon name="copy" size="sm" /> Copy
          </Button>
          <Button variant="secondary" onClick={() => void share()}>
            <Icon name="share-network" size="sm" /> Share
          </Button>
        </div>
      </LoadState>
      <p className={styles.muted}>
        Someone who enters this code sends a request. They get no access until you approve.
      </p>
      <div>
        <Button
          variant="ghost"
          onClick={() => setRotateOpen(true)}
          data-testid="family-code-rotate"
        >
          <Icon name="arrow-clockwise" size="sm" /> Generate new code
        </Button>
      </div>
      <FormMessage error={error} />

      <h3 className={styles.section}>Guardian requests</h3>
      <LoadState
        loading={requests.loading}
        error={requests.error}
        empty={requests.data?.length === 0}
        emptyText="No guardian requests."
        onRetry={requests.reload}
      >
        <ul className={styles.list} data-testid="guardian-requests">
          {requests.data?.map((r) => (
            <li key={r.request_id} className={styles.item}>
              <div className={styles.grow}>
                <strong>{r.requester_name}</strong>
                <p className={styles.muted}>
                  wants to join your family{r.message ? ` · “${r.message}”` : ''}
                </p>
              </div>
              <Button
                onClick={() => setApproving({ id: r.request_id, name: r.requester_name })}
                aria-label={`Approve ${r.requester_name}`}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => void decide(r.request_id, false)}
                aria-label={`Decline ${r.requester_name}`}
              >
                Decline
              </Button>
            </li>
          ))}
        </ul>
      </LoadState>

      <ConfirmSheet
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        title="Generate a new family code?"
        confirmLabel="Generate new code"
        busy={busy}
        alert
        onConfirm={() => void rotate()}
      >
        <p>The old code stops working. People who already joined keep their access.</p>
      </ConfirmSheet>
      <ConfirmSheet
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={approving ? approveQuestion(approving.name, childNames) : ''}
        confirmLabel="Give access"
        cancelLabel="Not now"
        busy={busy}
        alert
        onConfirm={() => approving && void decide(approving.id, true)}
      >
        <p>
          Guardians can see and manage every child in this family. Only approve someone you know.
        </p>
      </ConfirmSheet>
    </div>
  );
}
