import {
  addChildSchema,
  fieldErrors,
  friendlyError,
  joinCodeSchema,
  REQUEST_SENT_COPY,
  stepLabel,
  TEAM_CODE_NOT_FOUND_COPY,
  UNDER_13_COPY,
  type FieldErrors,
} from '@athleit/core';
import { addChild, getMyHouseholdId, requestToJoin } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { todayIso } from '@athleit/ui-core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { AppScreen } from '@/components/app/app-screen';
import { Choice, FormMessage, H1, Notice } from '@/components/app/kit';
import { useScreenTitle } from '@/components/app/screen-title';
import { Button, Card, DatePicker, Text, TextField } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { HUB_DONE_KEY, kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';

type Step = 'add' | 'team' | 'code' | 'sent';
interface Kid {
  id: string;
  first: string;
  last: string;
  age: number;
}

const ageFrom = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate()))
    a--;
  return a;
};

const STEP_NUMBER: Record<Step, number> = { add: 1, team: 2, code: 2, sent: 3 };
const TITLE: Record<Step, string> = {
  add: 'Add your child',
  team: 'Join their team',
  code: 'Join their team',
  sent: 'Request sent',
};

/**
 * Parent path in one screen so Back keeps what was typed: add children, ask about a team, send a
 * team code per child. Children are added as each is saved; the code step is the one that asks a
 * team for access, and it only ever sends a request.
 */
export default function ParentPathScreen() {
  const router = useRouter();
  const { refresh } = useApp();
  const [step, setStep] = useState<Step>('add');
  const [kids, setKids] = useState<Kid[]>([]);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'firstName' | 'lastName' | 'dateOfBirth'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kidId, setKidId] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<string[]>([]);

  useScreenTitle(TITLE[step], stepLabel('parent', STEP_NUMBER[step]) ?? undefined);

  const back = step === 'code' ? 'team' : step === 'team' ? 'add' : null;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!back) return false;
      setStep(back);
      return true;
    });
    return () => sub.remove();
  }, [back]);

  const blank = !first.trim() && !last.trim() && !dob;
  const unsent = kids.filter((k) => !sent.includes(k.id));

  async function saveChild(): Promise<boolean> {
    const parsed = addChildSchema.safeParse({ firstName: first, lastName: last, dateOfBirth: dob });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return false;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    const household = await getMyHouseholdId(supabase);
    const res = await addChild(supabase, { ...parsed.data, householdId: household.data });
    setBusy(false);
    if (res.error || !res.data) {
      setError(
        `We couldn’t add ${parsed.data.firstName}. Nothing was saved. Check your connection and try again.`,
      );
      return false;
    }
    setKids((k) => [
      ...k,
      {
        id: res.data as string,
        first: parsed.data.firstName,
        last: parsed.data.lastName,
        age: ageFrom(parsed.data.dateOfBirth),
      },
    ]);
    setFirst('');
    setLast('');
    setDob('');
    void refresh();
    return true;
  }

  async function onContinue() {
    if (blank && kids.length > 0) return setStep('team');
    if (await saveChild()) setStep('team');
  }

  function pickCodeFor(id: string) {
    setKidId(id);
    setCodeError(undefined);
    setError(null);
    setStep('code');
  }

  async function sendCode() {
    const parsed = joinCodeSchema.safeParse(code);
    if (!parsed.success) return setCodeError(parsed.error.issues[0]?.message);
    setCodeError(undefined);
    setError(null);
    setBusy(true);
    const res = await requestToJoin(supabase, {
      teamCode: parsed.data,
      playerId: kidId,
      message: message.trim() || null,
    });
    setBusy(false);
    if (res.error) {
      const text = `${res.error.message ?? ''}`;
      return setCodeError(
        /team_not_found/.test(text) ? TEAM_CODE_NOT_FOUND_COPY : friendlyError(res.error),
      );
    }
    setSent((s) => [...s, kidId]);
    setCode('');
    setMessage('');
    void kv.set(HUB_DONE_KEY, '1');
    setStep('sent');
  }

  function finish() {
    void kv.set(HUB_DONE_KEY, '1');
    router.replace('/');
  }

  const kid = kids.find((k) => k.id === kidId);
  return (
    <AppScreen>
      {step === 'add' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Add your child</H1>
          {kids.map((k) => (
            <Notice key={k.id}>{`${k.first} ${k.last} · Age ${k.age}`}</Notice>
          ))}
          <TextField
            label="First name"
            value={first}
            onChangeText={setFirst}
            autoComplete="off"
            error={errors.firstName}
          />
          <TextField
            label="Last name"
            value={last}
            onChangeText={setLast}
            autoComplete="off"
            error={errors.lastName}
          />
          <DatePicker
            label="Date of birth"
            value={dob}
            onChange={setDob}
            max={todayIso()}
            yearSpan={{ before: 25, after: 0 }}
            error={errors.dateOfBirth}
          />
          <Notice>{`${UNDER_13_COPY} Their date of birth stays private.`}</Notice>
          <FormMessage error={error} />
          <Button title="Continue" size="lg" loading={busy} onPress={() => void onContinue()} />
          <Button
            title="Add another child"
            variant="secondary"
            disabled={busy}
            onPress={() => void saveChild()}
          />
        </Card>
      ) : null}

      {step === 'team' ? (
        <Card style={{ gap: space[4] }}>
          <H1>
            {kids.length === 1 ? `Is ${kids[0]?.first} on a team?` : 'Is your child on a team?'}
          </H1>
          <Text muted>Your coach has a team code. Ask them if you don’t have it.</Text>
          {unsent.map((k) => (
            <Button
              key={k.id}
              title={`Enter a team code for ${k.first}`}
              variant="primary"
              onPress={() => pickCodeFor(k.id)}
            />
          ))}
          <Button title="Not yet" variant="secondary" onPress={finish} />
          <Text variant="caption" muted>
            You can join a team later from Home. Staff approve every request. Until then you can’t
            see the team’s information.
          </Text>
          <Button title="Back" variant="ghost" onPress={() => setStep('add')} />
        </Card>
      ) : null}

      {step === 'code' ? (
        <Card style={{ gap: space[4] }}>
          <H1>Enter the team code</H1>
          <TextField
            label="Team code"
            mono
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={14}
            value={code}
            onChangeText={setCode}
            hint="10 letters and numbers from your coach."
            error={codeError}
          />
          {unsent.length > 1 ? (
            <Choice
              label="Which child"
              value={kidId}
              onChange={setKidId}
              options={unsent.map((k) => ({ value: k.id, label: k.first }))}
            />
          ) : kid ? (
            <Text muted>{`For ${kid.first}`}</Text>
          ) : null}
          <TextField
            label="Message to the coach (optional)"
            value={message}
            onChangeText={setMessage}
            maxLength={500}
          />
          <FormMessage error={error} />
          <Button title="Send request" size="lg" loading={busy} onPress={() => void sendCode()} />
          <Button title="Back" variant="ghost" onPress={() => setStep('team')} />
        </Card>
      ) : null}

      {step === 'sent' ? (
        <Card style={{ gap: space[4] }} testID="parent-sent">
          <H1>{REQUEST_SENT_COPY.team.title}</H1>
          <Text>{REQUEST_SENT_COPY.team.body}</Text>
          {kids
            .filter((k) => sent.includes(k.id))
            .map((k) => (
              <Notice key={k.id}>{`${k.first} ${k.last} · Age ${k.age}`}</Notice>
            ))}
          <Button title="Done" size="lg" onPress={finish} />
          {unsent.map((k) => (
            <Button
              key={k.id}
              title={`Add a team code for ${k.first}`}
              variant="secondary"
              onPress={() => pickCodeFor(k.id)}
            />
          ))}
          <Button
            title="Join a family instead"
            variant="ghost"
            onPress={() => router.push('/onboarding/code?tab=family' as never)}
          />
        </Card>
      ) : null}
    </AppScreen>
  );
}
