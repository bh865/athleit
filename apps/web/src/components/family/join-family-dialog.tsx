'use client';

import {
  householdJoinCodeSchema,
  joinFamilyProblem,
  requestToJoinHouseholdSchema,
} from '@athleit/core';
import { requestToJoinHousehold } from '@athleit/db/api';
import { useState, type FormEvent } from 'react';

import { Button, Sheet, Text, TextArea, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

import styles from './family.module.css';

const MAX = 500;

const PROBLEM_COPY = {
  invalid_code:
    'That code isn’t right, or it has expired or been replaced. Check it or ask for a new one.',
  already_member: 'You’re already a guardian of this family.',
  too_many_attempts: 'Too many tries. Wait a few minutes and try again.',
  error: 'Couldn’t send the request. Check your connection and try again.',
} as const;

/** "Join a family with a code": sends a request; a guardian of that family approves it. */
export function JoinFamilyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [problem, setProblem] = useState<keyof typeof PROBLEM_COPY | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function close() {
    onClose();
    // Reset after the close animation frame so a reopened dialog starts clean.
    setCode('');
    setMessage('');
    setCodeError(undefined);
    setProblem(null);
    setSent(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const parsed = requestToJoinHouseholdSchema.safeParse({ code, message });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'message') return setProblem('error');
      return setCodeError(issue?.message);
    }
    setCodeError(undefined);
    setBusy(true);
    const res = await requestToJoinHousehold(getClient(), parsed.data);
    setBusy(false);
    if (res.error) return setProblem(joinFamilyProblem(res.error.message));
    setSent(true);
  }

  return (
    <Sheet open={open} onClose={close} title="Join a family with a code">
      {sent ? (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          data-testid="join-family-sent"
        >
          <Text variant="heading" as="h2">
            Request sent
          </Text>
          <Text muted>
            A guardian in that family will review it. You’ll see the family here once they approve.
          </Text>
          <div className={styles.dialogActions}>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => void onSubmit(e)}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <Text variant="heading" as="h2">
            Join a family with a code
          </Text>
          <TextField
            label="Family code"
            mono
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            value={code}
            hint="Letters and numbers only"
            error={
              codeError ?? (problem && problem !== 'error' ? PROBLEM_COPY[problem] : undefined)
            }
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              setCodeError(undefined);
              setProblem(null);
            }}
            data-testid="family-code-input"
          />
          <TextArea
            label="Message (optional)"
            value={message}
            maxLength={MAX}
            onChange={(e) => setMessage(e.target.value)}
          />
          <span className={styles.counter} aria-live="polite">
            {message.length} / {MAX}
          </span>
          {problem === 'error' ? (
            <p role="alert" className={styles.problem}>
              {PROBLEM_COPY.error}
            </p>
          ) : null}
          <div className={styles.dialogActions}>
            <Button variant="ghost" type="button" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={!householdJoinCodeSchema.safeParse(code).success}
            >
              Send request
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
