'use client';

import { addChildSchema, fieldErrors, friendlyError, type FieldErrors } from '@athleit/core';
import { addChild } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { formText } from '@/components/app/form-utils';
import { FormMessage } from '@/components/app/states';
import { todayIso } from '@athleit/ui-core';

import { Button, Card, DatePicker, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

export default function AddChildPage() {
  const router = useRouter();
  const { refresh, setActive, contexts } = useApp();
  const [errors, setErrors] = useState<FieldErrors<'firstName' | 'lastName' | 'dateOfBirth'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = addChildSchema.safeParse({
      firstName: formText(fd, 'firstName'),
      lastName: formText(fd, 'lastName'),
      dateOfBirth: formText(fd, 'dateOfBirth'),
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const household = contexts.find((c) => c.kind === 'family');
    const res = await addChild(getClient(), { ...parsed.data, householdId: household?.id });
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    await refresh();
    if (!household) setActive('family:new'); // falls back to the first context, the new family
    router.push('/family');
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className={styles.stack}>
        <h1 className={styles.title}>Add a child</h1>
        <p className={styles.notice}>
          You don’t need to join a team first. Children under 13 never have their own login; you
          manage everything for them.
        </p>
        <TextField
          name="firstName"
          label="First name"
          autoComplete="off"
          error={errors.firstName}
        />
        <TextField name="lastName" label="Last name" autoComplete="off" error={errors.lastName} />
        <DatePicker
          name="dateOfBirth"
          label="Date of birth"
          max={todayIso()}
          yearSpan={{ before: 25, after: 0 }}
          error={errors.dateOfBirth}
        />
        <FormMessage error={error} />
        <Button type="submit" loading={busy}>
          Add child
        </Button>
      </form>
    </Card>
  );
}
