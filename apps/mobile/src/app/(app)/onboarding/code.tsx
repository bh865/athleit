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
import { space } from '@athleit/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { Choice, FormMessage, H1, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Button, Card, SegmentedControl, Text, TextField } from '@/components/ui';
import { HUB_DONE_KEY, kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';

type Tab = 'team' | 'family';
type Result =
  | { kind: 'team' }
  | { kind: 'family'; outcome: 'sent' | 'invalid_code' | 'already_member' | 'too_many_attempts' };

/** "I have a code": a team code or a family code. Either only sends a request that someone approves. */
export default function CodeScreen() {
  useScreenTitle('Join with a code');
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'family' ? 'family' : 'team');
  const children = useLoad(() => listChildren(supabase), []);
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
    // A pasted invite or claim link goes to its own screen instead of failing as a code.
    const input = readCodeInput(code);
    if (input.kind === 'invite') return router.push(`/invite/${input.token}` as never);
    if (input.kind === 'claim') return router.push(`/claim/${input.playerId}` as never);

    if (tab === 'team') {
      const parsed = joinCodeSchema.safeParse(code);
      if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
      setBusy(true);
      const res = await requestToJoin(supabase, {
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
      void kv.set(HUB_DONE_KEY, '1');
      return setResult({ kind: 'team' });
    }

    const parsed = householdJoinCodeSchema.safeParse(code);
    if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
    setBusy(true);
    const res = await requestToJoinHousehold(supabase, {
      code: parsed.data,
      message: message.trim() || null,
    });
    setBusy(false);
    if (res.error) {
      const problem = joinFamilyProblem(res.error.message);
      if (problem === 'error') return setError(friendlyError(res.error));
      return setResult({ kind: 'family', outcome: problem });
    }
    void kv.set(HUB_DONE_KEY, '1');
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
      <AppScreen>
        <Card style={{ gap: space[4] }} testID="code-result">
          <H1>{title}</H1>
          <Text accessibilityRole={retry ? 'alert' : undefined}>{body}</Text>
          {retry ? (
            <Button title="Try again" onPress={() => setResult(null)} />
          ) : (
            <Button title="Done" onPress={() => router.replace('/')} />
          )}
        </Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Card style={{ gap: space[4] }}>
        <H1>Join with a code or invite</H1>
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
          autoCorrect={false}
          autoComplete="off"
          value={code}
          onChangeText={setCode}
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
          onChangeText={setMessage}
          maxLength={500}
        />
        <Notice>{CODE_RULE_COPY}</Notice>
        <FormMessage error={error} />
        <Button title="Send request" size="lg" loading={busy} onPress={() => void submit()} />
      </Card>
    </AppScreen>
  );
}
