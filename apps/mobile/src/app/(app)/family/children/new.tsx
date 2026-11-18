import { addChildSchema, fieldErrors, friendlyError, type FieldErrors } from '@athleit/core';
import { addChild } from '@athleit/db/api';
import { space } from '@athleit/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AppScreen } from '@/components/app/app-screen';
import { FormMessage, H1, Notice } from '@/components/app/kit';
import { todayIso } from '@athleit/ui-core';

import { Button, Card, DatePicker, TextField } from '@/components/ui';
import { useApp } from '@/lib/app-provider';
import { supabase } from '@/lib/supabase';

export default function AddChildScreen() {
  const router = useRouter();
  const { refresh, setActive, contexts } = useApp();
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'firstName' | 'lastName' | 'dateOfBirth'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = addChildSchema.safeParse({ firstName, lastName, dateOfBirth: dob });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const household = contexts.find((c) => c.kind === 'family');
    const res = await addChild(supabase, { ...parsed.data, householdId: household?.id });
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    await refresh();
    if (!household) setActive('family:new');
    router.replace('/family');
  }

  return (
    <AppScreen>
      <Card style={{ gap: space[4] }}>
        <H1>Add a child</H1>
        <Notice>
          You don’t need to join a team first. Children under 13 never have their own login; you
          manage everything for them.
        </Notice>
        <TextField
          label="First name"
          value={firstName}
          onChangeText={setFirst}
          autoComplete="off"
          error={errors.firstName}
        />
        <TextField
          label="Last name"
          value={lastName}
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
        <FormMessage error={error} />
        <Button title="Add child" loading={busy} onPress={() => void submit()} />
      </Card>
    </AppScreen>
  );
}
