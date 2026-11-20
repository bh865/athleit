'use client';

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
import { todayIso } from '@athleit/ui-core';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApp } from '@/components/app/app-provider';
import { FormMessage } from '@/components/app/states';
import { Choice } from '@/components/onboarding/choice';
import styles from '@/components/onboarding/onboarding.module.css';
import { HUB_DONE_KEY, setFlag } from '@/components/onboarding/storage';
import { Button, Card, DatePicker, PageHeader, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

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
 * Parent path in one page so Back keeps what was typed: add children, ask about a team, send a team
 * code per child. Only the code step asks a team for access, and it only ever sends a request.
 */
export default function ParentPathPage() {
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

  const blank = !first.trim() && !last.trim() && !dob;
  const unsent = kids.filter((k) => !sent.includes(k.id));
  const client = getClient();

  async function saveChild(): Promise<boolean> {
    const parsed = addChildSchema.safeParse({ firstName: first, lastName: last, dateOfBirth: dob });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return false;
    }
    setErrors({});
    setError(null);
    setBusy(true);
    const household = await getMyHouseholdId(client);
    const res = await addChild(client, { ...parsed.data, householdId: household.data });
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
    setBusy(true);
    const res = await requestToJoin(client, {
      teamCode: parsed.data,
      playerId: kidId,
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
    setSent((s) => [...s, kidId]);
    setCode('');
    setMessage('');
    setFlag(HUB_DONE_KEY);
    setStep('sent');
  }

  function finish() {
    setFlag(HUB_DONE_KEY);
    router.replace('/');
  }

  const kid = kids.find((k) => k.id === kidId);
  return (
    <>
      <PageHeader
        title={TITLE[step]}
        subtitle={stepLabel('parent', STEP_NUMBER[step]) ?? undefined}
      />
      {step === 'add' ? (
        <Card className={styles.stack}>
          {kids.length > 0 ? (
            <ul className={styles.kids}>
              {kids.map((k) => (
                <li key={k.id} className={styles.kid}>{`${k.first} ${k.last} · Age ${k.age}`}</li>
              ))}
            </ul>
          ) : null}
          <TextField
            label="First name"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            autoComplete="off"
            error={errors.firstName}
          />
          <TextField
            label="Last name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
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
          <p className={styles.muted}>{`${UNDER_13_COPY} Their date of birth stays private.`}</p>
          <FormMessage error={error} />
          <Button size="lg" loading={busy} onClick={() => void onContinue()}>
            Continue
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void saveChild()}>
            Add another child
          </Button>
        </Card>
      ) : null}

      {step === 'team' ? (
        <Card className={styles.stack}>
          <h2 style={{ margin: 0 }}>
            {kids.length === 1 ? `Is ${kids[0]?.first} on a team?` : 'Is your child on a team?'}
          </h2>
          <p className={styles.muted}>Your coach has a team code. Ask them if you don’t have it.</p>
          {unsent.map((k) => (
            <Button key={k.id} onClick={() => pickCodeFor(k.id)}>
              {`Enter a team code for ${k.first}`}
            </Button>
          ))}
          <Button variant="secondary" onClick={finish}>
            Not yet
          </Button>
          <p className={styles.muted}>
            You can join a team later from Home. Staff approve every request. Until then you can’t
            see the team’s information.
          </p>
          <Button variant="ghost" onClick={() => setStep('add')}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 'code' ? (
        <Card className={styles.stack}>
          <h2 style={{ margin: 0 }}>Enter the team code</h2>
          <TextField
            label="Team code"
            mono
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={14}
            value={code}
            onChange={(e) => setCode(e.target.value)}
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
            <p className={styles.muted}>{`For ${kid.first}`}</p>
          ) : null}
          <TextField
            label="Message to the coach (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
          />
          <FormMessage error={error} />
          <Button size="lg" loading={busy} onClick={() => void sendCode()}>
            Send request
          </Button>
          <Button variant="ghost" onClick={() => setStep('team')}>
            Back
          </Button>
        </Card>
      ) : null}

      {step === 'sent' ? (
        <Card className={styles.stack} data-testid="parent-sent">
          <h2 style={{ margin: 0 }}>{REQUEST_SENT_COPY.team.title}</h2>
          <p style={{ margin: 0 }}>{REQUEST_SENT_COPY.team.body}</p>
          <ul className={styles.kids}>
            {kids
              .filter((k) => sent.includes(k.id))
              .map((k) => (
                <li key={k.id} className={styles.kid}>{`${k.first} ${k.last} · Age ${k.age}`}</li>
              ))}
          </ul>
          <Button size="lg" onClick={finish}>
            Done
          </Button>
          {unsent.map((k) => (
            <Button key={k.id} variant="secondary" onClick={() => pickCodeFor(k.id)}>
              {`Add a team code for ${k.first}`}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => router.push('/onboarding/code?tab=family')}>
            Join a family instead
          </Button>
        </Card>
      ) : null}
    </>
  );
}
