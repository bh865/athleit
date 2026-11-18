'use client';

import {
  createTeamSchema,
  fieldErrors,
  friendlyError,
  SPORTS,
  type FieldErrors,
} from '@athleit/core';
import { createTeam, findClub } from '@athleit/db/api';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useApp } from '@/components/app/app-provider';
import styles from '@/components/app/app.module.css';
import { formText } from '@/components/app/form-utils';
import { FormMessage } from '@/components/app/states';
import { Button, Card, PageHeader, Select, TextField } from '@/components/ui';
import { getClient } from '@/lib/supabase/browser';

const SPORT_OPTIONS = SPORTS.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

export default function NewTeamPage() {
  const router = useRouter();
  const { refresh, setActive } = useApp();
  const [errors, setErrors] = useState<FieldErrors<'name' | 'sport' | 'seasonLabel' | 'clubSlug'>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = createTeamSchema.safeParse({
      name: formText(fd, 'name'),
      sport: formText(fd, 'sport'),
      seasonLabel: formText(fd, 'seasonLabel'),
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const client = getClient();

    // Optional: ask to affiliate with a club. This only files a request the club admin approves.
    let clubId: string | undefined;
    const clubSlug = formText(fd, 'clubSlug').trim();
    if (clubSlug) {
      const found = await findClub(client, clubSlug);
      if (found.error) {
        setBusy(false);
        return setError(friendlyError(found.error));
      }
      if (!found.data[0]) {
        setBusy(false);
        return setErrors({ clubSlug: 'No club has that web address.' });
      }
      clubId = found.data[0].id;
    }

    const res = await createTeam(client, { ...parsed.data, clubId });
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    await refresh();
    setActive(`team:${res.data}:admin`);
    router.push(`/teams/${res.data}`);
  }

  return (
    <>
      <PageHeader
        title="Create a team"
        subtitle="You’ll be the team’s admin. Teams don’t need a club."
      />
      <Card>
        <form onSubmit={onSubmit} noValidate className={styles.stack}>
          <TextField name="name" label="Team name" error={errors.name} />
          <Select
            name="sport"
            label="Sport"
            options={SPORT_OPTIONS}
            defaultValue="soccer"
            error={errors.sport}
          />
          <TextField
            name="seasonLabel"
            label="Season"
            hint="For example, Fall 2026"
            error={errors.seasonLabel}
          />
          <TextField
            name="clubSlug"
            label="Club web address (optional)"
            hint="If your team belongs to a club, enter its address. The club’s admin has to approve the link."
            autoCapitalize="none"
            error={errors.clubSlug}
          />
          <FormMessage error={error} />
          <Button type="submit" loading={busy}>
            Create team
          </Button>
        </form>
      </Card>
    </>
  );
}
