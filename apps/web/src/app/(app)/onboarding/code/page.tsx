'use client';

import {
  CODE_RULE_COPY,
  FAMILY_CODE_COPY,
  friendlyError,
  householdJoinCodeSchema,
  joinCodeSchema,
  joinFamilyProblem,
  readCodeInput,
  REQUEST_SENT_COPY,
  TEAM_CODE_NOT_FOUND_COPY,
} from '@athleit/core';
import { listChildren, requestToJoin, requestToJoinHousehold } from '@athleit/db/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { FormMessage } from '@/components/app/states';
import { Choice } from '@/components/onboarding/choice';
import styles from '@/components/onboarding/onboarding.module.css';
import { HUB_DONE_KEY, setFlag } from '@/components/onboarding/storage';
import { Button, Card, PageHeader, SegmentedControl, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';
import { useLoad } from '@/lib/use-load';

type Tab = 'team' | 'family';
type Result =
  | { kind: 'team' }
  | { kind: 'family'; outcome: 'sent' | 'invalid_code' | 'already_member' | 'too_many_attempts' };

/** "I have a code": a team code or a family code. Either only sends a request that someone approves. */
function CodeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const client = getClient();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'family' ? 'family' : 'team');
  const children = useLoad(() => listChildren(client), []);
  const [code, setCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [message, setMessage] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit() {
    setError(null);
    setCodeError(undefined);
    // A pasted invite or claim link goes to its own page instead of failing as a code.
    const input = readCodeInput(code);
    if (input.kind === 'invite') return router.push(`/invite/${input.token}`);
    if (input.kind === 'claim') return router.push(`/claim/${input.playerId}`);

    if (tab === 'team') {
      const parsed = joinCodeSchema.safeParse(code);
      if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
      setBusy(true);
      const res = await requestToJoin(client, {
        teamCode: parsed.data,
        playerId: playerId || null,
        message: message.trim() || null,
      });
      setBusy(false);
      if (res.error) {
        return setCodeError(
          /team_not_found/.test(res.error.message ?? '')
            ? TEAM_CODE_NOT_FOUND_COPY
            : friendlyError(res.error),
        );
      }
      setFlag(HUB_DONE_KEY);
      return setResult({ kind: 'team' });
    }

    const parsed = householdJoinCodeSchema.safeParse(code);
    if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
    setBusy(true);
    const res = await requestToJoinHousehold(client, {
      code: parsed.data,
      message: message.trim() || null,
    });
    setBusy(false);
    if (res.error) {
      const problem = joinFamilyProblem(res.error.message);
      if (problem === 'error') return setError(friendlyError(res.error));
      return setResult({ kind: 'family', outcome: problem });
    }
    setFlag(HUB_DONE_KEY);
    setResult({ kind: 'family', outcome: 'sent' });
  }

  if (result) {
    const family = result.kind === 'family' ? result.outcome : null;
    const title =
      family === 'invalid_code'
        ? 'That code doesn’t look right'
        : family === 'already_member'
          ? 'You’re already in this family'
          : family === 'too_many_attempts'
            ? 'Too many attempts'
            : 'Request sent';
    const body =
      result.kind === 'team'
        ? REQUEST_SENT_COPY.team.body
        : family === 'sent'
          ? REQUEST_SENT_COPY.household.body
          : family === 'invalid_code'
            ? 'Check it with the guardian who shared it and try again.'
            : family === 'already_member'
              ? 'You can find it under Family.'
              : FAMILY_CODE_COPY.too_many_attempts;
    const retry = family === 'invalid_code' || family === 'too_many_attempts';
    return (
      <>
        <PageHeader title={title} />
        <Card className={styles.stack} data-testid="code-result">
          <p role={retry ? 'alert' : undefined} style={{ margin: 0 }}>
            {body}
          </p>
          {retry ? (
            <Button onClick={() => setResult(null)}>Try again</Button>
          ) : (
            <Button onClick={() => router.replace('/')}>Done</Button>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Join with a code or invite" />
      <Card className={styles.stack}>
        <SegmentedControl
          label="Kind of code"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setCodeError(undefined);
          }}
          options={[
            { value: 'team', label: 'Team code' },
            { value: 'family', label: 'Family code' },
          ]}
        />
        <TextField
          label={tab === 'team' ? 'Team code' : 'Family code'}
          mono
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          hint={
            tab === 'team'
              ? '10 letters and numbers from your coach.'
              : 'From a guardian already in the family.'
          }
          error={codeError}
        />
        {tab === 'team' && children.data && children.data.length > 0 ? (
          <Choice
            label="Which child is this for?"
            value={playerId}
            onChange={setPlayerId}
            options={[
              { value: '', label: 'No child (I’m a parent)' },
              ...children.data.map((c) => ({ value: c.id, label: c.first_name })),
            ]}
          />
        ) : null}
        <TextField
          label={tab === 'team' ? 'Message (optional)' : 'How are you related? (optional)'}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
        <p className={styles.muted}>{CODE_RULE_COPY}</p>
        <FormMessage error={error} />
        <Button size="lg" loading={busy} onClick={() => void submit()}>
          Send request
        </Button>
      </Card>
    </>
  );
}

export default function CodePage() {
  return (
    <Suspense>
      <CodeForm />
    </Suspense>
  );
}
